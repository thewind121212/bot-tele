import { JWT } from 'google-auth-library';

import creds from '../serects/google.json'


const creditials: {
  client_email: string,
  private_key: string
} = {
  ...creds as any
}

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.readonly',
   'https://www.googleapis.com/auth/drive.file'
];



export const serviceAccountAuth = new JWT({
  email: creditials.client_email,
  key: creditials.private_key,
  scopes: SCOPES,
});


