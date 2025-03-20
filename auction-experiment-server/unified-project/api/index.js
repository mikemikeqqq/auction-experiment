const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// 启用 CORS
app.use(cors());
app.use(express.json());

// 从环境变量获取 MongoDB 连接 URL
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/auction_experiment';

// 连接到 MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('成功连接到 MongoDB'))
  .catch(err => console.error('MongoDB 连接错误:', err));

// 定义参与者数据模式
const participantSchema = new mongoose.Schema({
  participantId: String,
  group: String,
  uniqueCode: String,
  pageTimes: Object,
  bidHistory: {
    simulation: Array,
    formal: Array
  },
  surveyResponses: Object,
  riskResponses: Array,
  immediatePurchase: Boolean,
  finalWinner: Boolean,
  auctionProfit: Number,
  lotteryBonus: Number,
  alipay: String,
  createdAt: { type: Date, default: Date.now }
});

const Participant = mongoose.model('Participant', participantSchema);

// API 路由
app.post('/participants', async (req, res) => {
  try {
    console.log('收到数据:', req.body);
    const participant = new Participant(req.body);
    await participant.save();
    res.status(201).json({ message: '数据保存成功' });
  } catch (error) {
    console.error('保存数据时出错:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

app.get('/participants', async (req, res) => {
  try {
    const participants = await Participant.find();
    res.json(participants);
  } catch (error) {
    console.error('获取数据时出错:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 基本认证中间件
const basicAuth = (req, res, next) => {
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.set('WWW-Authenticate', 'Basic realm="管理员区域"');
    return res.status(401).send('需要认证');
  }

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];

  if (user === adminUser && pass === adminPass) {
    return next();
  } else {
    res.set('WWW-Authenticate', 'Basic realm="管理员区域"');
    return res.status(401).send('认证失败');
  }
};

// 管理面板 - 注意这里处理/admin路由
app.get('/admin', basicAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>拍卖实验数据管理</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        h1 { color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
        .json-view { max-height: 100px; overflow: auto; }
        #loading { display: none; }
        button { margin: 10px 0; padding: 8px 16px; }
      </style>
    </head>
    <body>
      <h1>拍卖实验数据管理</h1>
      <p>总参与人数：<span id="total">加载中...</span></p>
      <button onclick="exportData()">导出全部数据 (CSV)</button>
      <button onclick="refreshData()">刷新数据</button>
      <div id="loading">加载中...</div>
      <table id="dataTable">
        <thead>
          <tr>
            <th>ID</th>
            <th>分组</th>
            <th>唯一代码</th>
            <th>拍卖利润</th>
            <th>彩票奖金</th>
            <th>支付宝</th>
            <th>创建时间</th>
            <th>查看详情</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>

      <div id="details" style="display: none;">
        <h2>参与者详情</h2>
        <pre id="detailsContent"></pre>
      </div>

      <script>
        let allData = [];
        
        async function loadData() {
          document.getElementById('loading').style.display = 'block';
          try {
            const response = await fetch('/api/participants');
            allData = await response.json();
            document.getElementById('total').textContent = allData.length;
            
            const tbody = document.querySelector('#dataTable tbody');
            tbody.innerHTML = '';
            
            allData.forEach((item, index) => {
              const tr = document.createElement('tr');
              tr.innerHTML = \`
                <td>\${item.participantId || '未设置'}</td>
                <td>\${item.group || '未设置'}</td>
                <td>\${item.uniqueCode || '未设置'}</td>
                <td>\${item.auctionProfit || 0}</td>
                <td>\${item.lotteryBonus || 0}</td>
                <td>\${item.alipay || '未设置'}</td>
                <td>\${new Date(item.createdAt).toLocaleString()}</td>
                <td><button onclick="showDetails(\${index})">查看详情</button></td>
              \`;
              tbody.appendChild(tr);
            });
          } catch (error) {
            console.error('加载数据失败:', error);
            alert('加载数据时出错: ' + error.message);
          } finally {
            document.getElementById('loading').style.display = 'none';
          }
        }
        
        function showDetails(index) {
          const details = document.getElementById('details');
          const content = document.getElementById('detailsContent');
          content.textContent = JSON.stringify(allData[index], null, 2);
          details.style.display = 'block';
        }
        
        function refreshData() {
          loadData();
        }
        
        function exportData() {
          if (!allData.length) {
            alert('没有数据可导出');
            return;
          }
          
          // 获取所有可能的标题
          const headers = new Set();
          allData.forEach(item => {
            Object.keys(item).forEach(key => headers.add(key));
          });
          const headerArray = Array.from(headers);
          
          // 创建 CSV 内容
          let csvContent = headerArray.join(',') + '\\n';
          
          allData.forEach(item => {
            const row = headerArray.map(header => {
              const value = item[header];
              let cellValue = '';
              
              if (value === undefined || value === null) {
                cellValue = '';
              } else if (typeof value === 'object') {
                cellValue = JSON.stringify(value);
              } else {
                cellValue = String(value);
              }
              
              // 处理包含逗号、引号或换行符的单元格
              if (cellValue.includes(',') || cellValue.includes('"') || cellValue.includes('\\n')) {
                cellValue = '"' + cellValue.replace(/"/g, '""') + '"';
              }
              
              return cellValue;
            }).join(',');
            
            csvContent += row + '\\n';
          });
          
          // 创建下载链接
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', \`拍卖实验数据_\${new Date().toISOString().slice(0,10)}.csv\`);
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        
        window.onload = loadData;
      </script>
    </body>
    </html>
  `);
});

// Vercel 导出
module.exports = app; 