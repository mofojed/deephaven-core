def _getDeephavenObject(self):
    import base64
    from io import BytesIO
    # Save the matplotlib image to a temporary buffer
    buf = BytesIO()
    self.savefig(buf, format="png")
    return base64.b64encode(buf.getbuffer()).decode("ascii")

import os
import matplotlib.pyplot as plt
import matplotlib
plt.style.use(['dark_background', os.path.join(os.path.dirname(__file__), 'theme.mplstyle')])
matplotlib.figure.Figure.getDeephavenObject = _getDeephavenObject