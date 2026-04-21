# PantryPal Backend (`pp-backend`) — Codebase Report

**Group #3 | PROG8950 Capstone | Conestoga College (Winter 2026)**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (TypeScript) |
| Framework | Express.js wrapped with `@vendia/serverless-express` |
| Database | PostgreSQL (Amazon RDS) |
| ORM | Prisma Client v6 |
| Authentication | AWS Cognito (JWT Validation Middleware) |
| Infrastructure as Code | Terraform (v1.5+) |
| Storage | Amazon S3 (Pantry Uploads & AI Image Cache) |
| External APIs | Spoonacular API (Recipes), Unsplash/Pexels API (Images) |
| AI / LLM | AWS Bedrock (`amazon.nova-lite-v1:0`, `amazon.titan-image-generator-v1`) via AWS SDK v3 |

---

## Architecture Diagram

```mermaid
graph TD
    subgraph Frontend["PantryPal (React/Vite)"]
        UI[React UI Components]
        Redux[Redux Store]
    end

    subgraph AWS_Gateway["AWS API Gateway"]
        API_Route["/api/*"]
    end

    subgraph AWS_Cognito["AWS Cognito"]
        AuthPool[(User Pool)]
    end

    subgraph AWS_Lambda["Lambda: pp-backend-api"]
        App[Express Router]
        
        Auth[Auth Middleware]
        PantryMod[Pantry Module]
        RecipeMod[Recipes Module]
        MealMod[Meal Plan Module]
        OnboardMod[Onboarding Module]
        UserMod[Users Module]
    end

    subgraph AWS_RDS["AWS RDS (PostgreSQL)"]
        DB[(Prisma Postgres DB)]
    end

    subgraph AWS_S3["Amazon S3"]
        PantryBucket[(Pantry Uploads)]
        RecipeBucket[(AI Recipe Cache)]
    end

    subgraph External["External Services"]
        Bedrock["AWS Bedrock\n(Nova Lite & Titan)"]
        Spoon["Spoonacular API"]
        Unsplash["Unsplash API"]
    end

    %% Flow
    UI --> Redux
    Redux -->|HTTP Requests| AWS_Gateway
    AWS_Gateway -->|Cognito Authorizer| AWS_Cognito
    AWS_Gateway -->|Proxy Integration| App
    
    App --> Auth
    Auth --> PantryMod & RecipeMod & MealMod & OnboardMod & UserMod
    
    PantryMod & RecipeMod & MealMod & OnboardMod & UserMod -->|Prisma Query| DB
    
    PantryMod -.->|Presigned URLs| PantryBucket
    RecipeMod -.->|Upload generated images| RecipeBucket
    
    RecipeMod -->|Prompt| Bedrock
    RecipeMod -->|Search| Spoon
    RecipeMod -->|Fetch| Unsplash
```

---

## Project Structure

```text
pp-backend/
├── infra/
│   └── terraform/           # Terraform IaC files (main.tf, rds.tf, lambda.tf, etc.)
├── prisma/
│   ├── schema.prisma        # Database schema definitions
│   └── seed.ts              # Database seeding scripts
├── scripts/                 # Utility scripts (setup, bundle-lambda, destroy, etc.)
└── src/                     # Application Source Code
    ├── common/              # Shared utilities (AWS, S3, Prisma client, routing)
    ├── modules/             # Feature modules (Domain-Driven Design)
    │   ├── api/             # Main API Router
    │   ├── auth/            # JWT validation middleware
    │   ├── ingredients/     # Standardized ingredient logic
    │   ├── meal-plan/       # Meal planner logic and endpoints
    │   ├── onboarding/      # User onboarding workflow
    │   ├── pantry/          # Pantry inventory and receipt scanning
    │   ├── recipes/         # AI Generation, Spoonacular search, Image generation
    │   └── users/           # User profile management
    ├── lambda.ts            # Entrypoint for AWS Lambda (@vendia/serverless-express)
    └── main.ts              # Entrypoint for Local Development (Express server)
```

---

## Key Features & Flows

1. **Authentication & Identity:** Uses AWS Cognito to issue JWTs. The backend middleware decodes and verifies the JWT, extracting the user `sub` (subject ID) to map to a PostgreSQL `User` record.
2. **Pantry Management:** Users can add, edit, and remove ingredients from their pantry.
3. **Receipt Scanning:** Users upload receipt images. The backend uses AWS Bedrock to parse the image into a structured JSON list of ingredients.
4. **Spoonacular Recipes:** Users can search for recipes using their pantry ingredients via the Spoonacular API.
5. **AI Chef:** AWS Bedrock generates entirely custom recipes based on active pantry items, and Amazon Titan generates photorealistic images of the dish asynchronously.
6. **Meal Planning:** Users can assign recipes (both Spoonacular and AI-generated) to a persistent meal planner stored in RDS.

---

## Sequence Charts

### 1. User Authentication & Profile Lookup

```mermaid
sequenceDiagram
    actor User
    participant App as React Frontend
    participant Cognito as AWS Cognito
    participant Gateway as API Gateway
    participant Lambda as Backend Lambda
    participant DB as RDS PostgreSQL

    User->>App: Login
    App->>Cognito: Authenticate User
    Cognito-->>App: Return JWT Tokens
    
    App->>Gateway: GET /api/users/me (Bearer Token)
    Gateway->>Lambda: Proxy Event
    Lambda->>Lambda: AuthMiddleware (Verify JWT)
    Lambda->>DB: findUnique({ where: { subject: token.sub } })
    
    alt User exists
        DB-->>Lambda: User Profile
    else User is new
        Lambda->>DB: create({ data: { subject, ... } })
        DB-->>Lambda: New User Profile
    end
    
    Lambda-->>Gateway: 200 OK (User Profile)
    Gateway-->>App: 200 OK
```

### 2. Receipt Scanning (Pantry)

```mermaid
sequenceDiagram
    actor User
    participant Client as React Frontend
    participant Route as pantry.router.ts
    participant S3 as Amazon S3
    participant Bedrock as AWS Bedrock

    User->>Client: Upload Receipt Image
    Client->>Route: GET /api/pantry/upload-url (Request Presigned URL)
    Route->>S3: Generate Presigned PutObject URL
    S3-->>Route: URL & FileKey
    Route-->>Client: 200 OK { url, fileKey }
    
    Client->>S3: PUT Image directly to S3 URL
    S3-->>Client: 200 OK
    
    Client->>Route: POST /api/pantry/scan { fileKey, mimeType }
    Route->>S3: GetObject (Read Image Bytes)
    S3-->>Route: Image Bytes
    Route->>Bedrock: ConverseCommand (Nova Lite, pass Image Bytes + Prompt)
    Bedrock-->>Route: JSON Extracted Ingredients
    Route-->>Client: 200 OK { items }
```

### 3. AI Recipe & Image Generation (Async Flow)

```mermaid
sequenceDiagram
    actor User
    participant Client as React Frontend
    participant Route as recipes.router.ts
    participant Service as recipe-generate-list.service.ts
    participant Bedrock as AWS Bedrock
    participant S3 as Amazon S3

    User->>Client: Click "Generate Recipes"
    Client->>Route: POST /api/recipes/generate-list { ingredients }
    Route->>Service: generateAiRecipeList()
    Service->>Bedrock: ConverseCommand (Nova Lite)
    Bedrock-->>Service: JSON Recipe List
    Service-->>Route: Parsed Recipes
    Route-->>Client: 200 OK { recipes }
    
    Client-->>User: Display Text Recipes instantly (Shimmering Image Loader)
    
    loop For each Recipe
        Client->>Route: POST /api/recipes/generate-image { title, description }
        Route->>Bedrock: InvokeModelCommand (Titan Image Generator)
        Bedrock-->>Route: Base64 Image
        Route->>S3: PutObjectCommand (Upload to Recipe Cache)
        S3-->>Route: S3 Object URL
        Route-->>Client: 200 OK { imageUrl }
        Client-->>User: Render fully generated Image
    end
```

### 4. Spoonacular Recipe Search

```mermaid
sequenceDiagram
    actor User
    participant Client as React Frontend
    participant Route as recipes.router.ts
    participant Service as spoonacular.service.ts
    participant Spoon as Spoonacular API

    User->>Client: Open Recipes Tab
    Client->>Route: POST /api/recipes/spoonacular { ingredients, options }
    Route->>Service: searchRecipesByIngredients()
    
    Service->>Spoon: GET /recipes/complexSearch?includeIngredients=...
    Spoon-->>Service: Base Results (Title, Image)
    
    Service->>Spoon: GET /recipes/informationBulk?ids=...
    Spoon-->>Service: Detailed Results (Instructions, Time, Ingredients)
    
    Service-->>Route: Merged & Formatted Recipes
    Route-->>Client: 200 OK { recipes }
```

### 5. Add AI Recipe to Meal Plan

```mermaid
sequenceDiagram
    actor User
    participant Client as React Frontend
    participant Route as meal-plan.router.ts
    participant Service as meal-plan.service.ts
    participant DB as RDS PostgreSQL

    User->>Client: Click "Add to Meal Plan" on AI Recipe
    Client->>Route: POST /api/meal-plan/ai { AiRecipe }
    Route->>Service: saveAiRecipeToMealPlan(userId, aiRecipe)
    
    Service->>DB: findFirst({ where: { title: aiRecipe.title } })
    
    alt Recipe not in DB
        Service->>DB: create({ data: { id: 1500000000+, ...aiRecipe } })
        DB-->>Service: Persistent Recipe ID
    end
    
    Service->>DB: create({ data: { MealPlanItem } })
    DB-->>Service: Created MealPlanItem
    
    Service-->>Route: Success
    Route-->>Client: 200 OK
```

---

## Data Persistence Summary

The database uses PostgreSQL (via Amazon RDS) and is managed via Prisma ORM.

### Core Tables:
*   `User`: Primary profile linked to AWS Cognito (`subject`).
*   `PantryItem`: Belongs to `User`. Stores name, quantity, category, and expiration date.
*   `Recipe`: Stores recipe metadata (Spoonacular or AI-generated). AI recipes are dynamically saved here when added to a meal plan to ensure relational integrity.
*   `MealPlanItem`: Junction table linking `User` and `Recipe`. Represents a planned meal.
*   `UserPreference`: Stores dietary restrictions, allergies, and cooking skill level gathered during onboarding.

---

## Running Locally

To run the backend locally on your machine (it will connect to your cloud RDS database and AWS services):

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Sync Cloud Environment Variables:**
   ```bash
   npm run env:from-tf
   ```
   *This copies your AWS outputs (Database URL, API URL, etc.) from Terraform into your `.env` file.*

3. **Start Local Express Server:**
   ```bash
   npm run dev
   ```
   *The API will start at `http://localhost:3000/api`.*

---

## Deployment Steps

Because this architecture uses AWS Lambda, the backend code does **not** deploy automatically when you push to GitHub. You must bundle and deploy it manually.

**To deploy code changes to AWS:**
```bash
npm run deploy
```
*(Windows Users: Run `cmd /c npm run deploy` if you encounter execution policy errors.)*

**What this does:**
1. Uses `esbuild` to compile all TypeScript files into a single optimized `dist/main.js`.
2. Packages the output into a `.zip` archive.
3. Runs `terraform apply` to upload the new zip to AWS Lambda and update any modified infrastructure.
