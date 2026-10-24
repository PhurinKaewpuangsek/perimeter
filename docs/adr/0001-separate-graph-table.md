# 0001: Dedicated DynamoDB Table for Routing Graph and Closures

## Context
Perimeter V4 introduces indoor navigation and real-time temporary walkway/room closures. The system needs to store approximately 590 graph elements (nodes and edges) for the LC-3 building, support whole-graph retrieval for pathfinding and visualization, and allow authorized staff to update closure time windows dynamically.

## Decision
We store routing nodes and edges in a dedicated DynamoDB table, `SmartFacultyGraph`, using partition key `graph_id` (e.g. `'LC3'`) and sort key `element_id` (`NODE#<node_id>` or `EDGE#<from>|<to>`), rather than embedding graph topology inside `SmartFacultyLocations` or serving it as static S3 JSON.

## Rationale & Trade-offs
- **Dynamic Closure Writes:** Storing graph data as static JSON on S3 would prevent staff from toggling closures (`PUT /api/graph/closures`) with fine-grained DynamoDB conditional updates without rebuilding or redeploying assets.
- **Query Efficiency:** With `graph_id` as the partition key, the entire building routing topology (~90 KB) can be fetched in a single Query operation without table scans, pagination cascades, or multi-table joins.
- **Separation of Concerns:** Room records in `SmartFacultyLocations` contain presentation attributes, SVG bounds, categories, and capacities. Mixing ~300 corridor junctions, stairs, and edge connections into the locations table would degrade room search queries and pollute domain boundaries.
- **IAM Least Privilege:** A dedicated table enables isolated `dynamodb:Query` permissions for public route calculation (`GetRouteFunction`), `dynamodb:Query` for graph loading (`GetGraphFunction`), and `dynamodb:UpdateItem` for closure updates (`UpdateClosureFunction`) without exposing room or schedule records to unintentional writes.
