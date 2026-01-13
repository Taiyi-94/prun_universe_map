# Taiyi's Prosperous Universe Map
An interactive, data-rich visualization of the Prosperous Universe game world. 
This project provides a user-friendly interface for exploring star systems, planets, and their resources, 
with features including:

* Interactive SVG-based map of the game universe
* Detailed information panels for each star system and planet
* Pathfinding functionality to plot routes between systems
* Visual indicators for planet tiers and available facilities
* Integration with game data for up-to-date information on resources and COGC programs
* React-based UI with D3.js for smooth interactions and animations

Perfect for players looking to plan their interstellar trade routes or for those curious about the vast 
Prosperous Universe game world. Contributions welcome!

### Updating the PRUN data:

* Replace `public/prun_universe_data.json` with the contents from the FIO endpoint: https://rest.fnar.net/systemstars
* Replace `public/planet_data.json` with the contents of: https://rest.fnar.net/planet/allplanets/full
* `public/systemstars.json` is an edited version of `prun_universe_data` that has star luminosity - this is manually added, the data is in FIO for individual stars, like https://rest.fnar.net/systemstars/star/HM-223. This is not expected to change very often therefore this file can remain static unless new systems are added to the game.
* At the moment the PrUn_Universe_map svg files need to be hand edited in inkscape with new data.
* `public/gateways.json` is hand created until an endpoint becomes available.
* `public/population_data.json` - Server side script which regularly calls "https://rest.fnar.net/csv/infrastructure/allreports" and saves only the last, relevant entry and saves it to the population_data.json
* Run the python script  `parse_svg.py` to extract positions in the SVG into `graph_data.json`


### Tech Stack:

* React
* D3.js
* SVG
* Tailwind CSS

### Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

### Available Scripts

In the project directory, you can run:

#### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

#### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

#### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

#### Changing the homepage:

By default this will assume you are hosting the map at the root of your webserver. To change that, adjust the homepage field in your package.json file before building.

#### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

### Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

#### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

#### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

#### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

#### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

#### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

#### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
