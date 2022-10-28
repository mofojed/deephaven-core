load("@com_google_jsinterop_generator//:jsinterop_generator.bzl", "jsinterop_generator")

package(
    default_visibility = [
        "//:__subpackages__",
    ],
    # Apache2
    licenses = ["notice"],
)

jsinterop_generator(
    name = "openapi",
    srcs = ["externs.js"],
    extension_type_prefix = "DeephavenOpenapi",
    integer_entities_files = ["integer_entities.txt"],
    # override auto generated js_deps in order not to provide extern files
    # Common extern file are included by default.
    j2cl_js_deps = [],
    name_mapping_files = ["name_mappings.txt"],
    package_prefix = "io.deephaven.javascript.proto",
    deps = [
        "//third_party:elemental2-core",
        "//third_party:elemental2-promise",
    ],
)
