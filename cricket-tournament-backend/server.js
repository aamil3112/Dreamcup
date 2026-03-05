import { app } from "./app.js";

// MongoDB is not required when using Google Sheets as the primary data store.
// The server now runs without establishing a database connection.

app.listen(process.env.PORT, () => {
  console.log(`Server is working on ${process.env.PORT}`);
});
