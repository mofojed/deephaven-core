# Deephaven Extensions Example

This branch serves as a proof of concept of how to extend Deephaven functionality. Not everything is done correctly, it's just meant to spark discussion.
Uses the web-client-ui from https://github.com/mofojed/web-client-ui/tree/matplotlib

To get this demo to work:
1. Start up docker as normal, eg. `./gradlew prepareCompose` and `docker-compose up --build`
2. From another terminal, install matplotlib package: `docker-compose exec grpc-api pip install -U matplotlib`
3. Open up the UI (http://localhost:10000), and execute the following to initialize matplotlib extension in Deephaven environment, adding the special `getDeephavenObject` method:
```python
def _getDeephavenObject(self):
    import base64
    from io import BytesIO
    # Save the matplotlib image to a temporary buffer
    buf = BytesIO()
    self.savefig(buf, format="png")
    return base64.b64encode(buf.getbuffer()).decode("ascii")

import matplotlib.pyplot as plt
import matplotlib
matplotlib.figure.Figure.getDeephavenObject = _getDeephavenObject
```
4. Run the following command to create a plot 
```python
import matplotlib.pyplot as plt
import numpy as np
import base64
from io import BytesIO
fig, ax = plt.subplots()  # Create a figure containing a single axes.
ax.plot([1, 2, 3, 4], [4, 2, 6, 7])  # Plot some data on the axes.
```

The plot should then appear in the UI. You may need to run the command twice.