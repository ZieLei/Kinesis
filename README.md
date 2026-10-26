
# Kinesis

**Manage motorcycle parts, track inventory, and record sales from one mobile point-of-sale application.**

Kinesis is a mobile POS system built to help motorcycle parts shops manage products, monitor stock levels, record transactions, and review sales performance. It aims to keep everyday store operations accessible through a straightforward interface and a practical, locally manageable data system.

## Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [Development](#development)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Overview

Kinesis focuses on the core tasks involved in running a motorcycle parts shop.

- **Record sales** to keep track of transactions.
- **Manage inventory** to monitor products and available stock.
- **Review reports** to understand sales activity and product performance.
- **Organize products** to make items easier to find and manage.
- **Simplify daily operations** through a mobile-first interface.

The project is developed with a focus on usability, maintainability, and reliable data handling.

## Features

### Process Sales

- Browse available motorcycle parts.
- Select products and manage the cart.
- Review items before completing a transaction.
- Keep transaction records organized.

### Manage Inventory

- Browse and search for products.
- Organize parts by category.
- Track prices and stock quantities.
- Add, edit, and remove product records as supported by the current implementation.

### Review Reports

- Review sales summaries.
- Compare sales across reporting periods.
- Identify best-selling products.
- Inspect recorded transactions.

### Use a Mobile-First Interface

- Navigate between the dashboard, sales, inventory, and reports.
- Use a consistent visual design across screens.
- Access essential POS workflows from a mobile device.

## Tech Stack

Kinesis uses the following technologies to build and run the application.

| Technology | Purpose |
| --- | --- |
| [React](https://react.dev/) | Build reusable, component-based user interfaces |
| [React Native](https://reactnative.dev/) | Render native mobile interfaces |
| [Expo](https://expo.dev/) | Develop, build, and run the mobile application |
| [Expo Router](https://docs.expo.dev/router/introduction/) | Navigate between screens using file-based routing |
| [TypeScript](https://www.typescriptlang.org/) | Catch type errors and improve code maintainability |
| [NativeWind](https://www.nativewind.dev/) | Style components with utility classes |
| [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/) | Create smooth animations and transitions |
| [Lucide](https://lucide.dev/) | Provide consistent interface icons |
| [Python](https://www.python.org/) | Implement backend logic |
| [FastAPI](https://fastapi.tiangolo.com/) | Build backend API endpoints |
| [Uvicorn](https://www.uvicorn.org/) | Serve the backend application |


## Architecture

Kinesis separates its mobile interface from its backend API.

```text
Kinesis
├── Mobile Application
│   ├── React Native
│   ├── Expo
│   ├── Expo Router
│   └── NativeWind
│
└── Backend
    ├── Python
    ├── FastAPI
    └── Uvicorn
```

The mobile application handles user interaction and presents data. The backend provides an API layer for processing requests and managing application data.

The project prioritizes a practical deployment approach suitable for a small motorcycle parts business. Database and deployment decisions should support the client's operational requirements, including data persistence, reliability, and manageable hosting costs.

## Getting Started

### Prerequisites

Install the following tools before running the project:

- [Node.js](https://nodejs.org/) and npm
- [Git](https://git-scm.com/)
- [Python](https://www.python.org/) and pip
- [Expo development environment](https://docs.expo.dev/get-started/set-up-your-environment/)

For Android development, install the required Android SDK tools or prepare a compatible Android device.

### Clone the Repository

```bash
git clone https://github.com/ZieLei/Kinesis
cd Kinesis
```


### Install Mobile Dependencies

From the project root, run:

```bash
npm install
```

### Configure the Backend

Move into the backend directory:

```bash
cd backend
```

Create and activate a Python virtual environment.

**Linux and macOS**

```bash
python -m venv .venv
source .venv/bin/activate
```

**Windows PowerShell**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install the backend dependencies:

```bash
pip install -r requirements.txt
```

If the backend does not yet contain a `requirements.txt` file, install its declared dependencies using the project's current dependency configuration instead.

Return to the project root when you finish:

```bash
cd ..
```

## Running the Application

Run the mobile application and backend in separate terminals.

### Start the Backend

Open a terminal and run:

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend will listen on port `8000`.

Open the interactive API documentation at:

- [Swagger UI](http://127.0.0.1:8000/docs)
- [ReDoc](http://127.0.0.1:8000/redoc)

These addresses are available when the backend is running on the same machine.

### Start the Mobile Application

Open another terminal from the project root:

```bash
npx expo start
```

Follow the Expo CLI instructions to launch the application in your configured development environment.

For Android development, use a compatible Android device or emulator.

### Connect the Mobile Application to the Backend

Configure the API base URL to match the environment in which the backend runs.

Examples:

| Environment | Example API URL |
| --- | --- |
| Android emulator | `http://10.0.2.2:8000` |
| Physical Android device | `http://<computer-lan-ip>:8000` |
| Same-machine local client | `http://127.0.0.1:8000` |

A physical device and the development computer generally need to share a network. Use the computer's reachable LAN address rather than `127.0.0.1`, which refers to the device itself.

Keep development URLs separate from production configuration. Do not commit secrets, private credentials, or sensitive configuration files.

## Project Structure

The repository separates application screens, shared components, data, and backend logic.

```text
Kinesis/
├── backend/
│   ├── main.py
│   └── ...
├── src/
│   ├── app/
│   │   ├── dashboard/
│   │   ├── new-sale/
│   │   ├── stock/
│   │   └── reports/
│   ├── assets/
│   ├── components/
│   └── ...
├── package.json
├── tsconfig.json
├── metro.config.js
├── global.css
└── README.md
```

The tree above illustrates the intended organization. Actual directories may differ as the repository evolves.

| Directory or file | Responsibility |
| --- | --- |
| `src/app/` | Define application routes and screens |
| `src/assets/` | Store images, icons, and other visual assets |
| `src/components/` | Share reusable interface components |
| `backend/` | Implement API endpoints and backend logic |
| `package.json` | Declare JavaScript dependencies and scripts |
| `metro.config.js` | Configure Metro and NativeWind |
| `global.css` | Define global styles and utility framework entry points |

## Development

### Follow the Existing Conventions

- Keep components focused on their primary responsibility.
- Reuse shared components and styling patterns.
- Keep TypeScript types explicit where they improve clarity.
- Separate API communication from presentation logic.
- Validate input before processing transactions.
- Handle loading, empty, and error states consistently.
- Avoid committing generated files, local environments, or uploaded data that should remain private.

### Run the Development Server

Start Expo with:

```bash
npx expo start
```

Start the backend separately:

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Check the Code

Run the checks configured in the project before committing changes.

For Expo projects with the appropriate linting dependencies and scripts:

```bash
npx expo lint
```

If the project includes a TypeScript check script or uses the TypeScript compiler directly, run:

```bash
npx tsc --noEmit
```

Resolve relevant errors before merging changes.

## Roadmap

The roadmap outlines potential areas for continued development. Items should be marked complete only after they have been implemented and verified.

- [ ] Connect all POS workflows to persistent storage.
- [ ] Validate and preserve transaction records.
- [ ] Update inventory consistently after completed sales.
- [ ] Calculate sales summaries from recorded transactions.
- [ ] Add input validation and meaningful error handling.
- [ ] Improve recovery from interrupted operations.
- [ ] Test the application on supported Android devices.
- [ ] Document backup, restore, and deployment procedures.
- [ ] Prepare a reliable production configuration.

## Contributing

Contributions and suggestions are welcome.

1. Fork the repository.
2. Create a branch for your changes.
3. Make and test your changes.
4. Commit your work with a descriptive message.
5. Open a pull request explaining what changed and why.

Keep changes focused, follow existing project conventions, and avoid committing credentials or sensitive business data.

## License

No license has been specified yet.

Add a `LICENSE` file before distributing the project under an open-source license. Until then, do not assume that others have permission to redistribute or modify the code.

---

**Kinesis** — a mobile point-of-sale system for motorcycle parts retail.
