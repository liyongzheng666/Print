# OCCTest: Face Boundary JSON Exporter / 面边界 JSON 导出器

This module provides a C++ utility function to export the boundary attributes of an OpenCASCADE `TopoDS_Face` into a structured JSON format containing 3D coordinates and 2D UV parameters.
本模块提供了一个 C++ 工具函数，用于将 OpenCASCADE 的 `TopoDS_Face` 边界信息导出为包含 3D 坐标和 2D UV 参数的结构化 JSON 格式。

The generated schema aligns identically with the JavaScript parser requirements used by our web-based surface rendering viewer.
生成的 JSON 结构与我们的网页版曲面渲染查看器中的 JavaScript 解析器要求完全保持一致。

## Files / 文件说明
* `OCCDebugJsonExport.h` : Header file exposing the `OCCDebug::ExportFaceBoundaryToJson` API. / 暴露导出功能的头文件。
* `OCCDebugJsonExport.cpp` : Implementation file containing the topological traversal logic and lightweight string formatting. / 包含拓扑遍历逻辑和轻量级字符串格式化处理的实现文件。

## Prerequisites / 依赖要求
* Standard C++11 (or newer) / C++11 或更新标准
* OpenCASCADE Technology (OCCT) dependencies (`TopoDS`, `BRep_Tool`, `BRepTools_WireExplorer`, etc.) / OCCT 相关依赖库

## Usage Example / 使用示例

1. Include the header file where your face algorithms exist. / 在您的面处理算法文件中引入头文件。
2. Obtain a valid OpenCASCADE `TopoDS_Face`. / 获取一个有效的 OpenCASCADE `TopoDS_Face` 对象。
3. Call the export method logic and write its result string to disk or output. / 调用导出方法并将结果字符串写入文件或输出流。

```cpp
#include "OCCDebugJsonExport.h"
#include <fstream>
#include <iostream>

#include <TopoDS_Face.hxx>

// Helper routine inside your OCC application
// OCC 应用中的辅助函数
void DumpFaceForViewer(const TopoDS_Face& aFace) {
    // Generate JSON string from Face, sampling 20 points along each edge
    // 从 Face 生成 JSON 字符串，每条边采样 20 个点
    std::string jsonStr = OCCDebug::ExportFaceBoundaryToJson(aFace, 20);

    // Save out to a valid JSON file for inspecting in the dual-viewer application
    // 保存为有效的 JSON 文件，以便在双视图应用中检查
    std::ofstream out("debug_face_output.json");
    if (out.is_open()) {
        out << jsonStr;
        out.close();
        std::cout << "Successfully exported boundary JSON for Face! / 成功导出面的边界 JSON！" << std::endl;
    } else {
        std::cerr << "Failed to open output file / 无法打开输出文件" << std::endl;
    }
}
```

Once the JSON file is generated automatically via debugging, load it inside the `Print` web viewer to physically visualize the UV map corresponding to the 3D surface.
在调试过程中自动生成 JSON 文件后，您可以将其加载到 `Print` 网页查看器中，直观地可视化 3D 曲面对应的 UV 参数映射。
