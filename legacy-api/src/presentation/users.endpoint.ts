import express from 'express';
import { Readable } from 'stream';
import { UsersService } from "../domain/users.service";

export const usersEndpoint = async (request: express.Request, response: express.Response) => {
    
    response.setHeader('Content-Type', 'application/json');

    // as vezes retornar erro na chamada
    if (Math.random() < 0.2) {
      response.status(500).json({ error: 'Internal server error' });
      return;
    }

    // as vezes retornar too many requests
    if (Math.random() < 0.2) {
      response.status(429).json({ error: 'Too many requests' });
      return;
    }

    const stream = new Readable({ read: () => {} });
    stream.pipe(response);
  
    let skip = 0;
    let limit = 100;
    let hasMore = true;
    while (hasMore) {
      const usersService = new UsersService();
      const { total, data } = await usersService.getPaginatedUsers(skip, limit);

      // as vezes enviar dados corrompidos
      if (Math.random() < 0.2) {
        stream.push('{/dados/:/corrimpidos/}');
      }

      stream.push(JSON.stringify(data));
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      skip += limit;
      hasMore = skip < total;
    }
    
    stream.push(null);
  };