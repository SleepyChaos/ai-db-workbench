# Milvus fixture

使用 ANN Benchmarks 的 SIFT10K 向量基准，10,000 条、128 维向量，适合验证集合 schema、索引、标量过滤和相似度检索。需要更大压测时可把来源切换到 SIFT1M。

```bash
python3 fixtures/fetch.py milvus
```

下载后使用 bvecs/fvecs 转换工具或 Milvus 官方导入示例加载；原始数据来源：[ANN Benchmarks](https://github.com/erikbern/ann-benchmarks)，数据集原始站点：[TexMex](http://corpus-texmex.irisa.fr/)。
