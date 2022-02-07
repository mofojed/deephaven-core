# Using this matplotlib docker-custom

1. In this folder, run `docker build . -t js-plugin-matplotlib:local-build`
2. In the root folder, run `./gradlew prepareCompose && docker-compose up --build`
3. In the root folder in another terminal, run `docker-compose exec server pip install deephaven-plugin-matplotlib && docker-compose restart server`

You should be good to go! You can create a matplotlib figure by running the following:
```
import matplotlib.pyplot as plt
plt.figure()
x = [1, 2, 4, 6]
y = [6, 3, 4, 8]
plt.plot(x, y)
plt.xlabel('x values')
plt.ylabel('y values')
plt.title('plotted x and y values')
plt.legend(['line 1'])

f=plt.gcf()
```