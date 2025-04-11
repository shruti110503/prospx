# Build stage
FROM node:18-alpine as build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
# Using --legacy-peer-deps to resolve the React 19 vs react-linkedin-login-oauth2 compatibility issue
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build the app (using environment variables from build args)
ARG VITE_URL
ARG VITE_APOLLO_API_KEY
ARG VITE_STRIP_PUBLIC_KEY
ARG VITE_LINKEDIN_CLIENT_ID
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_LINKEDIN_REDIRECT_URI
ARG VITE_GOOGLE_REDIRECT_URI

# Store secrets in a more secure way (consider using Docker secrets for production)
ENV VITE_URL=$VITE_URL
ENV VITE_APOLLO_API_KEY=$VITE_APOLLO_API_KEY
ENV VITE_STRIP_PUBLIC_KEY=$VITE_STRIP_PUBLIC_KEY
ENV VITE_LINKEDIN_CLIENT_ID=$VITE_LINKEDIN_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_LINKEDIN_REDIRECT_URI=$VITE_LINKEDIN_REDIRECT_URI
ENV VITE_GOOGLE_REDIRECT_URI=$VITE_GOOGLE_REDIRECT_URI

RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config if needed
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]