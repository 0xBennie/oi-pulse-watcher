# CVD 监控更新频率配置选项

## 当前配置：5分钟归一化快照

- **后端数据收集**: 定时任务仍可每 1 分钟执行，但所有原始行情会聚合成对齐的 5 分钟快照（自动补齐缺口）
- **前端刷新**: 每 1 分钟拉取最新的 5 分钟快照
- **告警判断窗口**: 最近 1 个快照对比 5 分钟前的快照（真实 5 分钟变化）

## 其他可选配置

### 选项1：30秒超快响应（极端）
```sql
-- 修改 Cron Job 为每30秒
SELECT cron.schedule(
  'auto-collect-cvd-every-30sec',
  '* * * * *', -- 仍然是每分钟，但在函数内部sleep 30秒再执行第二次
  ...
);
```

**前端刷新**:
```typescript
useCoinMonitor(30000) // 30秒
```

**优点**: 极快响应  
**缺点**: 
- 可能触发币安API限流
- 数据噪音大，误报多
- Lovable Cloud 使用量增加3倍

### 选项2：2分钟均衡（推荐生产环境）
```sql
SELECT cron.schedule(
  'auto-collect-cvd-every-2min',
  '*/2 * * * *', -- 每2分钟
  ...
);
```

**前端刷新**:
```typescript
useCoinMonitor(120000) // 2分钟
```

**优点**: 
- 响应快
- 过滤部分噪音
- 不会触发限流

**缺点**: 
- 比1分钟略慢

### 选项3：5分钟稳定（保守）
```sql
SELECT cron.schedule(
  'auto-collect-cvd-every-5min',
  '*/5 * * * *', -- 每5分钟
  ...
);
```

**前端刷新**:
```typescript
useCoinMonitor(300000) // 5分钟
```

**优点**: 
- 稳定可靠
- 数据质量高
- 成本低

**缺点**: 
- 可能错过快速行情

## 告警判断窗口调整

如果修改数据收集频率，建议同步调整告警判断窗口：

### 当前逻辑（5 分钟快照）
```typescript
// 对比最新快照与 5 分钟前的快照
const recentData = await supabase
  .from('cvd_data')
  .select('cvd, price')
  .eq('symbol', symbol)
  .order('timestamp', { ascending: false })
  .limit(12);
```

### 如果改为30秒收集
```typescript
// 对比最近 6 个数据点（约3分钟变化）
.limit(6);
```

### 如果改为2分钟收集
```typescript
// 对比最近 2 个数据点（约4分钟变化）
.limit(2);
```

## 建议

- **日内交易**: 1分钟
- **波段交易**: 2-3分钟  
- **趋势交易**: 5分钟
- **测试阶段**: 1分钟（当前配置）
