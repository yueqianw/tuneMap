# TuneScape - AI-Powered Location-Based Music Generation

<div align="center">

![TuneScape Logo](https://img.shields.io/badge/TuneScape-AI%20Music%20Generation-blue?style=for-the-badge&logo=music)

*Transform locations into melodies with AI-powered music generation*

[![React](https://img.shields.io/badge/React-18.2.0-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![Flask](https://img.shields.io/badge/Flask-2.3.3-000000?style=flat-square&logo=flask)](https://flask.palletsprojects.com/)
[![Google Maps](https://img.shields.io/badge/Google%20Maps-API-4285F4?style=flat-square&logo=google-maps)](https://developers.google.com/maps)
[![Gemini AI](https://img.shields.io/badge/Gemini%20AI-Vision-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)
[![Suno AI](https://img.shields.io/badge/Suno%20AI-Music%20Generation-FF6B6B?style=flat-square)](https://suno.ai/)

</div>

## Project Overview

TuneScape is an web application that generates music compositions based on locations and their images. By combining Google Maps integration, AI-powered image analysis, and advanced music generation technology, users can explore the world and create location-inspired melodies.

###  Key Features

- **Interactive Map Interface**: Seamless Google Maps integration with location search, filtering, and selection
- **Visual Analysis**: AI-powered image processing using Google Gemini Vision API
- **AI Music Generation**: Location-aware music creation via Suno AI API
- **Persistent Storage**: SQLite/PostgreSQL database for task history and management

## Architecture

### Frontend (React + Vite)
- **Framework**: React 18.2.0 with modern hooks and functional components
- **Build Tool**: Vite for fast development and optimized builds
- **Maps**: Google Maps JavaScript API with Places integration
- **Styling**: Custom CSS with responsive design
- **HTTP Client**: Axios for API communication

### Backend (Flask)
- **Framework**: Flask 2.3.3 with RESTful API design
- **Database**: SQLAlchemy ORM with SQLite/PostgreSQL support
- **CORS**: Cross-origin resource sharing enabled
- **File Handling**: Secure image upload and processing
- **Task Management**: Asynchronous background processing

### AI Integration
- **Image Analysis**: Google Gemini 1.5 Flash Vision API
- **Music Generation**: Suno AI API for location-inspired compositions
- **Cultural Context**: Location-aware music style recommendations



## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- Python 3.8+
- Google Maps API Key
- Google Gemini API Key
- Suno AI API Key

### 1. Clone the Repository
```bash
git clone https://github.com/yueqianw/tuneMap.git
cd tuneMap
```

### 2. Frontend Setup
```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Add your VITE_GOOGLE_MAPS_API_KEY to .env
```

### 3. Backend Setup
```bash
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
# Configure your API keys in .env
```

### 4. Environment Configuration

#### Frontend (.env)
```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
VITE_API_BASE_URL=http://localhost:5000
```

#### Backend (.env)
```env
FLASK_ENV=development
PORT=5000
DATABASE_URL=sqlite:///music_generation.db
GEMINI_API_KEY=your_gemini_api_key
SUNO_API_KEY=your_suno_api_key
UPLOAD_FOLDER=uploads
```

### 5. Database Initialization
```bash
cd backend
python setup_database.py init
```

### 6. Start Development Servers

#### Backend (Flask)
```bash
cd backend
python app.py
```

#### Frontend (Vite)
```bash
npm run dev
```


## 📁 Project Structure

```
tuneMap/
├── 📁 src/                          # Frontend source code
│   ├── 📁 components/               # React components
│   │   ├── MusicGenerator.jsx      # Main application component
│   │   ├── MusicSlideshowModal.jsx # Image slideshow modal
│   │   └── *.css                   # Component stylesheets
│   ├── 📁 data/                    # API integration
│   │   └── musicAPI.js             # API client and utilities
│   ├── 📁 utils/                   # Utility functions
│   │   ├── mapStyles.js            # Google Maps styling
│   │   └── mapUtils.js             # Map utility functions
│   ├── App.jsx                     # Root component
│   └── main.jsx                    # Application entry point
├── 📁 backend/                     # Backend source code
│   ├── app.py                      # Flask application & API routes
│   ├── music_agent.py              # AI music generation logic
│   ├── setup_database.py           # Database management scripts
│   └── requirements.txt            # Python dependencies
├── 📁 uploads/                     # Image upload storage
├── 📁 instance/                    # Database files
├── package.json                    # Frontend dependencies
└── vite.config.js                  # Vite configuration
```

## API Endpoints

### Music Generation
- `POST /api/upload-images` - Upload location images
- `POST /api/generate-music` - Start music generation process
- `GET /api/task-status/<task_id>` - Get generation progress
- `GET /api/tasks` - List all tasks
- `DELETE /api/task/<task_id>` - Delete a task

### System
- `GET /health` - Health check endpoint
- `POST /api/cleanup-files` - Clean up orphaned files

## Features in Detail

### Interactive Map Interface
- **Location Search**: Google Places Autocomplete integration
- **Place Filtering**: Filter by categories (churches, museums, parks, etc.)
- **Info Windows**: Rich location information display
- **Street View Integration**: Location image capture

### AI-Powered Analysis
- **Visual Processing**: Image compression and optimization
- **Cultural Context**: Location-aware cultural analysis
- **Music Style Recommendation**: Region-specific music suggestions
- **Lyrics Generation**: Contextual song lyrics creation

### Music Generation Pipeline
1. **Image Upload**: Secure file handling with validation
2. **Visual Analysis**: Gemini AI processes location images
3. **Cultural Mapping**: Location-specific music style identification
4. **Music Creation**: Suno AI generates location-inspired compositions
5. **Progress Tracking**: Real-time status updates
6. **Result Delivery**: Music playback and download options


##  License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

##  Acknowledgments

- **Google Maps API** for location services
- **Google Gemini AI** for visual analysis
- **Suno AI** for music generation
- **React & Flask** communities for excellent documentation



---

<div align="center">

**Made with ❤️ by the CPAC-TuneScape Team**

*Transform your world into music*

</div>

