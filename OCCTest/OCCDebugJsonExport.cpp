#include "OCCDebugJsonExport.h"

#include <vector>
#include <sstream>
#include <iomanip>
#include <set>

#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Wire.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Vertex.hxx>
#include <TopExp_Explorer.hxx>
#include <TopExp.hxx>
#include <BRep_Tool.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <Geom_Curve.hxx>
#include <Geom2d_Curve.hxx>
#include <gp_Pnt.hxx>
#include <gp_Pnt2d.hxx>
#include <TopTools_IndexedMapOfShape.hxx>

namespace OCCDebug {

// --- Data Structure Definitions ---
struct PointData {
    std::string id;
    double x, y, z;
    double u, v;
};

struct ConnInfo {
    std::string edge_id;
    std::string via_point_id;
    std::string self_at;
    std::string other_at;
};

struct EdgeInfo {
    std::string id;
    std::vector<std::string> point_ids;
    std::string start_point_id;
    std::string end_point_id;
    std::string type;
    std::vector<ConnInfo> connected_edges;
};

std::string ExportFaceBoundaryToJson(const TopoDS_Face& face, int sample_count) {
    int pointCounter = 1;
    int edgeCounter = 1;

    TopTools_IndexedMapOfShape vertexMap;
    std::vector<PointData> allPoints;
    std::set<std::string> emittedPts;
    std::vector<EdgeInfo> allEdges;

    // Traverse all wires (boundary loop) on the face
    TopExp_Explorer explW(face, TopAbs_WIRE);
    for(; explW.More(); explW.Next()) {
        TopoDS_Wire wire = TopoDS::Wire(explW.Current());
        // BRepTools_WireExplorer allows traversing edges in their connected order
        BRepTools_WireExplorer wExp(wire, face);

        std::vector<EdgeInfo> currentWireEdges;
        for(; wExp.More(); wExp.Next()) {
            TopoDS_Edge edge = wExp.Current();
            
            Standard_Real f, l;
            Handle(Geom2d_Curve) c2d = BRep_Tool::CurveOnSurface(edge, face, f, l);
            Handle(Geom_Curve) c3d   = BRep_Tool::Curve(edge, f, l);
            
            if(c2d.IsNull() || c3d.IsNull()) continue;

            // Determine parameter direction based on edge orientation in face
            bool isFwd = (edge.Orientation() == TopAbs_FORWARD || edge.Orientation() == TopAbs_INTERNAL);
            double tStart = isFwd ? f : l;
            double tEnd   = isFwd ? l : f;
            
            // Get end vertices
            TopoDS_Vertex V1 = TopExp::FirstVertex(edge, Standard_True);
            TopoDS_Vertex V2 = TopExp::LastVertex(edge, Standard_True);
            
            // Assign / map globally unique Vertex IDs
            int v1_idx = vertexMap.FindIndex(V1);
            if (v1_idx == 0) v1_idx = vertexMap.Add(V1); // new vertex
            
            int v2_idx = vertexMap.FindIndex(V2);
            if (v2_idx == 0) v2_idx = vertexMap.Add(V2); // new vertex
            
            char buf[32];
            snprintf(buf, sizeof(buf), "P%03d", v1_idx);
            std::string sid = buf;
            
            snprintf(buf, sizeof(buf), "P%03d", v2_idx);
            std::string eid = buf;
            
            if (vertexMap.Extent() >= pointCounter) {
                pointCounter = vertexMap.Extent() + 1;
            }

            // Initialize edge info
            EdgeInfo ef;
            snprintf(buf, sizeof(buf), "E%04d", edgeCounter++);
            ef.id = std::string(buf);
            ef.start_point_id = sid;
            ef.end_point_id   = eid;
            ef.type = "polyline";
            
            int numSamples = (sample_count < 2) ? 2 : sample_count;
            
            // Subdivide the edge into parameters
            for(int i = 0; i < numSamples; ++i) {
                double t = tStart + (tEnd - tStart) * i / (numSamples - 1);
                gp_Pnt p3 = c3d->Value(t);
                gp_Pnt2d p2 = c2d->Value(t);
                
                std::string currentPid;
                if (i == 0) {
                    currentPid = sid;
                } else if (i == numSamples - 1) {
                    currentPid = eid;
                } else {
                    int id = pointCounter++;
                    snprintf(buf, sizeof(buf), "P%03d", id);
                    currentPid = std::string(buf);
                }
                
                // Track points to avoid duplicated output on nodes
                if (emittedPts.find(currentPid) == emittedPts.end()) {
                    allPoints.push_back({currentPid, p3.X(), p3.Y(), p3.Z(), p2.X(), p2.Y()});
                    emittedPts.insert(currentPid);
                }
                ef.point_ids.push_back(currentPid);
            }
            currentWireEdges.push_back(ef);
        }
        
        // --- Establish connection relations for connected_edges in current wire loop ---
        int nEdges = currentWireEdges.size();
        if(nEdges > 0) {
            bool realClosed = (currentWireEdges[0].start_point_id == currentWireEdges.back().end_point_id);

            for(int i = 0; i < nEdges; ++i) {
                EdgeInfo& e = currentWireEdges[i];
                
                if (i > 0 || realClosed) {
                    int prevIdx = (i == 0) ? nEdges - 1 : i - 1;
                    EdgeInfo& prevE = currentWireEdges[prevIdx];
                    ConnInfo cPrev;
                    cPrev.edge_id = prevE.id;
                    cPrev.via_point_id = e.start_point_id;
                    cPrev.self_at = "start";
                    cPrev.other_at = "end";
                    e.connected_edges.push_back(cPrev);
                }
                
                if (i < nEdges - 1 || realClosed) {
                    int nextIdx = (i == nEdges - 1) ? 0 : i + 1;
                    EdgeInfo& nextE = currentWireEdges[nextIdx];
                    ConnInfo cNext;
                    cNext.edge_id = nextE.id;
                    cNext.via_point_id = e.end_point_id;
                    cNext.self_at = "end";
                    cNext.other_at = "start";
                    e.connected_edges.push_back(cNext);
                }
            }
        }
        allEdges.insert(allEdges.end(), currentWireEdges.begin(), currentWireEdges.end());
    }

    // --- JSON Serialization ---
    std::ostringstream mainO;
    mainO << "{\n";
    mainO << "  \"format\": \"cg_edge_export\",\n";
    mainO << "  \"version\": \"1.0\",\n";
    mainO << "  \"meta\": {\n";
    mainO << "    \"unit\": \"mm\",\n";
    mainO << "    \"coord_system\": \"right_handed\",\n";
    mainO << "    \"note\": \"Exported directly from OpenCASCADE Face\"\n";
    mainO << "  },\n";

    // Serialize Points
    mainO << "  \"points\": [\n";
    for(size_t i = 0; i < allPoints.size(); ++i) {
        const PointData& p = allPoints[i];
        mainO << "    {\n";
        mainO << "      \"id\": \"" << p.id << "\",\n";
        mainO << "      \"x\": " << p.x << ",\n";
        mainO << "      \"y\": " << p.y << ",\n";
        mainO << "      \"z\": " << p.z << ",\n";
        mainO << "      \"u\": " << p.u << ",\n";
        mainO << "      \"v\": " << p.v << "\n";
        mainO << "    }";
        if (i < allPoints.size() - 1) mainO << ",";
        mainO << "\n";
    }
    mainO << "  ],\n";

    // Serialize Edges
    mainO << "  \"edges\": [\n";
    for(size_t i = 0; i < allEdges.size(); ++i) {
        const EdgeInfo& e = allEdges[i];
        mainO << "    {\n";
        mainO << "      \"id\": \"" << e.id << "\",\n";
        mainO << "      \"point_ids\": [\n";
        for(size_t j = 0; j < e.point_ids.size(); ++j) {
            mainO << "        \"" << e.point_ids[j] << "\"";
            if (j < e.point_ids.size() - 1) mainO << ",";
            mainO << "\n";
        }
        mainO << "      ],\n";
        mainO << "      \"start_point_id\": \"" << e.start_point_id << "\",\n";
        mainO << "      \"end_point_id\": \"" << e.end_point_id << "\",\n";
        mainO << "      \"type\": \"" << e.type << "\",\n";
        mainO << "      \"curve_hint\": {\n";
        mainO << "        \"kind\": \"nurbs_discrete\",\n";
        mainO << "        \"degree\": 3,\n";
        mainO << "        \"sample_count\": " << sample_count << "\n";
        mainO << "      },\n";
        mainO << "      \"connected_edges\": [\n";
        for(size_t j = 0; j < e.connected_edges.size(); ++j) {
            mainO << "        {\n";
            mainO << "          \"edge_id\": \"" << e.connected_edges[j].edge_id << "\",\n";
            mainO << "          \"via_point_id\": \"" << e.connected_edges[j].via_point_id << "\",\n";
            mainO << "          \"self_at\": \"" << e.connected_edges[j].self_at << "\",\n";
            mainO << "          \"other_at\": \"" << e.connected_edges[j].other_at << "\"\n";
            mainO << "        }";
            if (j < e.connected_edges.size() - 1) mainO << ",";
            mainO << "\n";
        }
        mainO << "      ]\n";
        mainO << "    }";
        if (i < allEdges.size() - 1) mainO << ",";
        mainO << "\n";
    }
    mainO << "  ]\n";
    mainO << "}\n";

    return mainO.str();
}

} // namespace OCCDebug
