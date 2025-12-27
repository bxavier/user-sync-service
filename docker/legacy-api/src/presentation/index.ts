import express from 'express';
import { usersEndpoint } from './users.endpoint';
import { validateHandle } from './validation.handle';

require('dotenv').config()

const app = express();
app.get('/external/users', validateHandle, usersEndpoint);
app.listen(3001, () => { console.log(`Api de usuários está executando.`); });