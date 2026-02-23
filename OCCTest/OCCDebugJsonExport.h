#pragma once

#include <string>

class TopoDS_Face;

namespace OCCDebug {

/**
 * @brief Exports OpenCASCADE Face boundary information (3D coordinates and UV 2D parameters)
 *        to a JSON string matching the specific cg_edge_export format.
 *
 * @param face         The OpenCASCADE Face to export.
 * @param sample_count Number of discrete sample points per edge. Default is 20.
 * @return std::string JSON formatted string containing the points and edges.
 */
std::string ExportFaceBoundaryToJson(const TopoDS_Face& face, int sample_count = 20);

} // namespace OCCDebug
