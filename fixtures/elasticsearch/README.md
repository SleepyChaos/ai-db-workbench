# Elasticsearch fixture

使用 NYC Open Data 的 NYPD Motor Vehicle Collisions 数据，固定下载 20,000 行窗口，Elastic 官方示例提供 mapping、ingest pipeline 和 Kibana 配置。需要更大压测时可去掉 `$limit` 下载全量。

```bash
python3 fixtures/fetch.py elasticsearch
```

来源：[Elastic example](https://github.com/elastic/examples/tree/master/Exploring%20Public%20Datasets/nyc_traffic_accidents) 和 [NYC Open Data](https://data.cityofnewyork.us/Public-Safety/NYPD-Motor-Vehicle-Collisions/h9gi-nx95)。
