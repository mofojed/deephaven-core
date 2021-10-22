import setuptools

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setuptools.setup(
    name="deephaven_matplotlib",
    version="0.0.1",
    author="Deephaven Data Labs LLC",
    author_email="support@deephaven.io",
    description="matplotlib integration into Deephaven",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/mofojed/deephaven-core/tree/matplotlib",
    project_urls={
        "Bug Tracker": "https://github.com/deephaven/deephaven-core/issues",
    },
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    package_dir={"": "src"},
    packages=setuptools.find_packages(where="src"),
    python_requires=">=3.6",
)