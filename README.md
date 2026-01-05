# Camel Server - The Smokers Lounge Game Server

Multiplayer Pokemon-style game server for the Joe Camel universe.

## Quick Deploy on CasaOS

### From GitHub:

```bash
cd /DATA
git clone https://github.com/CptSamFalcon/camelserver.git
cd camelserver
docker-compose up -d
```

### Update:

```bash
cd /DATA/camelserver
git pull
docker-compose up -d --build
```

## Local Development

```bash
npm install
npm start
```

Server runs on `http://localhost:3000`

## API Endpoints

- `GET /api/health` - Health check

## Socket.io Events

See main project documentation for Socket.io event details.

