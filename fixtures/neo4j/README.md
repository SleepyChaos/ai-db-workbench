# Neo4j fixture

使用 Neo4j 官方 Stack Overflow graph dump，包含问题、回答、标签、用户及关系，6,193 个节点、11,540 条关系。适合首个图工作台和 Cypher 验证。

```bash
python3 fixtures/fetch.py neo4j
# 使用 neo4j-admin load --from fixtures/local/neo4j/stackoverflow-43.dump 导入
```

来源：[neo4j-graph-examples/stackoverflow](https://github.com/neo4j-graph-examples/stackoverflow)。
