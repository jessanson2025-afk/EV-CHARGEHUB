# EV ChargeHub Complete

## Run in VS Code

1. Extract the ZIP.
2. Open the `EV-ChargeHub-Complete` folder in VS Code.
3. Open Terminal.
4. Run:

```bash
npm install
```

5. Start:

```bash
node server.js
```

6. Open:

http://localhost:3000

## Admin

http://localhost:3000/admin

Email:
admin@evchargehub.com

Password:
Admin@123

## Search

The search is already fully implemented.

It searches:
- Station name
- City/location
- Address
- Charging type
- Amenities

It is case-insensitive and searches automatically while typing.

Examples:
Mangalore
Bangalore
Udupi
Mysore
MG Road
GreenCharge

## Features

- Registration/login
- Driver profile
- Station search/filter
- Live station listing
- Station details
- Google Maps directions
- AC/DC charging
- Charging speed
- Price per kWh
- Cost estimate
- Charging-time estimate
- Booking
- Booking conflict prevention
- Booking update
- Booking cancellation
- Booking history
- Green impact section
- Admin dashboard
- Add stations
- SQLite database
- Responsive UI

If you previously ran an older version, this package is self-contained. If an old database causes unexpected sample data, stop the server and delete `database/evcharge.db`, then run the server again to recreate the database.


## IMPORTANT — if you used an older version

Use this folder as a completely new project. Do not mix files with the previous project.

In VS Code Terminal:

```bash
Ctrl + C
npm install
node server.js
```

Then open:

http://localhost:3000

If Chrome still displays the old page, press:

```text
Ctrl + Shift + R
```

The new version disables static-file caching.

### Search fix

The new frontend downloads the complete station list and performs the city/station/address search directly in JavaScript. Therefore searches such as `Mangalore`, `Bangalore`, `Udupi`, `Mysore`, `MG Road`, and `GreenCharge` do not depend on the browser sending a search query correctly.

You can verify the backend with:

http://localhost:3000/api/search-test

It should show the station names and cities as JSON.
