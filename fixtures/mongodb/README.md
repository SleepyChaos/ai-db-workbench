# MongoDB fixture

使用 MongoDB Atlas 官方 sample data archive，优先导入 `sample_training` 数据库中的集合，保留嵌套文档、数组、日期和可聚合字段。

```bash
python3 fixtures/fetch.py mongodb
# 按 MongoDB 官方文档解包 sampledata.archive，再用 mongoimport 导入目标集合
```

来源：[MongoDB Atlas sample data](https://www.mongodb.com/docs/atlas/sample-data/)。
