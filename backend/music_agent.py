# music_agent.py
from dotenv import load_dotenv
import google.generativeai as genai
from google import genai as new_genai # 导入新的genai包并重命名以避免冲突
import requests
import base64
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import json
from PIL import Image
import io
import os
from dotenv import load_dotenv

# 获取当前文件所在目录
current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(current_dir, '.env')
load_dotenv(env_path)

@dataclass
class AgentMemory:
    """Agent's memory storage"""
    conversation_history: List[Dict] = field(default_factory=list)
    extracted_info: Dict = field(default_factory=dict)
    generated_description: str = ""
    generated_lyrics: str = ""

class MusicGenerationAgent:
    """Music Generation AI Agent using a Gemini Vision model"""
    
    def __init__(self, gemini_api_key: str, suno_api_key: Optional[str] = None):
        # 使用新的genai.Client来配置
        self.client = new_genai.Client(api_key=gemini_api_key)
        # 选择有图片理解能力的模型，例如 gemini-1.5-flash 或 gemini-1.0-pro-vision
        self.model_name = 'gemini-1.5-flash-latest'
        self.suno_api_key = suno_api_key
        self.memory = AgentMemory()
        
        # Agent's system prompt
        self.system_prompt = """
        You are a professional music creation AI assistant. Your tasks are:
        1. Analyze the provided image content, understanding visual elements, emotions, and atmosphere
        2. Combine geographical location information to consider local cultural characteristics
        3. Generate music style descriptions that match the image's mood
        4. Output structured music generation parameters
        
        Please return the analysis results in JSON format.
        """
    
    def load_and_compress_image(self, image_path: str, max_size: tuple = (1024, 1024), quality: int = 85) -> Image.Image:
        """Load and compress PIL Image to reduce size"""
        try:
            # Load the image
            img = Image.open(image_path)
            
            # Convert to RGB if it's in RGBA or other modes
            if img.mode in ('RGBA', 'LA', 'P'):
                # Create a white background for transparent images
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Get original size
            original_size = img.size
            original_file_size = self._get_file_size(image_path)
            
            # Resize if the image is larger than max_size
            if img.size[0] > max_size[0] or img.size[1] > max_size[1]:
                img.thumbnail(max_size, Image.Resampling.LANCZOS)
                print(f"Image resized from {original_size} to {img.size}")
            
            # If the image is still potentially large, compress it further
            if original_file_size > 2 * 1024 * 1024:  # If original file > 2MB
                # Save to a BytesIO buffer to compress
                buffer = io.BytesIO()
                img.save(buffer, format='JPEG', quality=quality, optimize=True)
                buffer.seek(0)
                
                # Load the compressed image back
                img = Image.open(buffer)
                compressed_size = len(buffer.getvalue())
                print(f"Image compressed from {original_file_size/1024/1024:.2f}MB to {compressed_size/1024/1024:.2f}MB")
            
            return img
            
        except Exception as e:
            print(f"Error loading/compressing image {image_path}: {e}")
            return None
    
    def _get_file_size(self, file_path: str) -> int:
        """Get file size in bytes"""
        try:
            import os
            return os.path.getsize(file_path)
        except:
            return 0
    
    def analyze_images_and_location(self, image_paths: List[str], location: str) -> Dict[str, Any]:
        """Analyze images and geographical location information using the new client method"""
        
        # Load and compress images
        images = []
        for image_path in image_paths:
            img = self.load_and_compress_image(image_path)
            if img:
                images.append(img)
        
        if not images:
            return {"error": "No valid images could be loaded"}
        print("!!!Location:",location)
        
        # Construct prompt
        prompt = f"""
        Please analyze the following geographical location and accompanying image(s), and generate culturally and musically relevant insights.

        Location: {location}

        Please strictly follow the steps below to ensure strong regional identity in your analysis:

        1. **Determine the unique cultural, historical, and emotional characteristics of the location.**  
        For example:  
        - "The Great Wall of China" → evokes Chinese imperial history, traditional Chinese aesthetics, heroic and historical atmosphere  
        - "Milan Cathedral" → associated with Gothic architecture, Christian spirituality, and grand pipe organ music

        2. **Visually analyze the provided image(s)**:  
        Describe the visual elements (architecture, nature, colors, light) and how they reflect the location’s mood or atmosphere.  
        **Always clearly state the location name** in your visual analysis.

        3. **Extract cultural and geographical identity**:  
        Reflect unique elements from the region's art, music, architecture, and customs.

        4. **Recommend a music style that is native or symbolic of the location**.  
        Do not recommend generic genres. For instance:  
        - Chinese locations → Chinese traditional music, pentatonic scale, guzheng, erhu  
        - Gothic European cathedrals → Church organ, Gregorian chant, modal harmony  
        - South American towns → Andean music, pan flute, charango

        5. **Generate detailed music creation parameters**, deeply rooted in the regional style:
        - Tempo (in BPM or culturally relevant terms)
        - Musical key or scale (e.g., pentatonic, Dorian mode, etc.)
        - Culturally significant instruments (e.g., sitar, shakuhachi, duduk)
        - Mood and atmosphere consistent with both visuals and cultural background

        Return the result in the following strict JSON format:
        {{
            "visual_analysis": "The location is {location}, a place rich in cultural symbolism and emotional depth. The accompanying image supports this with visual cues such as brief visual description, e.g. 'ancient stone walls', 'towering spires', 'mist-covered mountains', but the essence is carried by the historical and geographical weight of {location}. This site conveys a powerful sense of emotional keywords, e.g. grandeur, serenity, isolation, rooted in its iconic status. The imagery further enhances the location’s unique character rather than defining it. The emotional atmosphere is shaped foremost by the cultural resonance of {location}, not just by visual elements.",
            "cultural_context": "Brief explanation of the cultural, historical, or religious meaning of the location and its musical implications.",
            "music_style": "Name of the musical genre or tradition that is most authentic to the location.",
            "mood": "One or two emotional tones (e.g. majestic and solemn, nostalgic and warm, etc.)",
            "tempo": "Suggested tempo (e.g., 60 BPM slow and reflective, or moderate-fast folk rhythm)",
            "key": "Musical key or scale (e.g., D Dorian, traditional pentatonic, etc.)",
            "instruments": ["list", "of", "authentic", "and", "representative", "instruments"],
            "atmosphere": "Summarized description of the scene's overall emotional and cultural atmosphere."
        }}
        """

     
        try:
            # Use the new client.models.generate_content method for image analysis
            # We need to construct the contents list with the prompt and image parts
            contents = [prompt] + images
            response = self.client.models.generate_content(
                model=self.model_name, 
                contents=contents
            )
            result_text = response.text
            
            # Try to parse JSON, if failed save raw text
            try:
                # Extract JSON from response if it contains extra text
                start_idx = result_text.find('{')
                end_idx = result_text.rfind('}')
                if start_idx != -1 and end_idx != -1:
                    json_str = result_text[start_idx:end_idx+1]
                    parsed_result = json.loads(json_str)
                else:
                    parsed_result = {"raw_analysis": result_text}
            except json.JSONDecodeError:
                parsed_result = {"raw_analysis": result_text}
            
            # Store in memory
            self.memory.extracted_info = parsed_result
            self.memory.conversation_history.append({
                "step": "analysis",
                "input": {"images": len(image_paths), "location": location},
                "output": parsed_result
            })
            
            return parsed_result
            
        except Exception as e:
            print(f"Error during analysis: {e}")
            return {"error": str(e)}
        
    def generate_lyrics(self, analysis_result: Dict[str, Any]) -> str:
        """Generate song lyrics based on image and location analysis"""

        prompt = f"""
        You are a professional lyricist. Based on the analysis result below, write concise, poetic lyrics that reflect the unique identity of the place.

        Requirements:
        - Structure: 2 short verses and 1 chorus
        - Use the place name and highlight regional identity
        - Include phrases in the local language if culturally appropriate
        - Match the vision, style and mood: {analysis_result.get('visual_analysis', '')}, {analysis_result.get('cultural_context', '')}, {analysis_result.get('music_style', '')}, {analysis_result.get('mood', '')}
        - Express the emotions and atmosphere from the analysis
        - Avoid literal image descriptions; focus on tone and cultural feeling

        Analysis:
        {json.dumps(analysis_result, indent=2)}

        Output only lyrics, no explanations.
        """

        try:
            response = self.client.models.generate_content(
                model='gemini-1.5-flash-latest',
                contents=prompt
            )
            lyrics = response.text.strip()
            
            # Store lyrics in memory
            self.memory.generated_lyrics = lyrics
            self.memory.conversation_history.append({
                "step": "lyric_generation",
                "input": analysis_result,
                "output": lyrics
            })
            
            print("Generated lyrics:\n", lyrics)
            return lyrics
            
        except Exception as e:
            print(f"Error generating lyrics: {e}")
            return f"Error generating lyrics: {e}"
    
    def generate_music_description(self, analysis_result: Dict[str, Any]) -> str:
        """Generate music description based on analysis results"""
        
        prompt = f"""
        You are a music production expert. Based on the analysis result below, generate a **concise, regionally distinctive** music style description for Suno AI.

        Analysis Result:
        {json.dumps(analysis_result, indent=2)}

        Instructions:
        - Focus on traditional or culturally unique **regional genres, instruments, scales, and moods**
        - Do **not** use generic styles like "pop", "neo-classical", or "ambient"
        - Must include:
        - Specific **regional genre**
        - Representative **local instruments**
        - **Tempo** and **energy**
        - **Key** or **mode** if mentioned or implied
        - **Atmosphere** tied to the location’s emotion
        - Limit: **max 200 characters**
        - Output only the style description, no explanation

        Example format:
        "Japanese gagaku with sho and koto, slow tempo, pentatonic scale, meditative and sacred mood"

        Now generate one for the input below.
        """

        
        try:
            response = self.client.models.generate_content(
                model='gemini-1.5-flash-latest',
                contents=prompt
            )
            description = response.text.strip()
            
            # Ensure description is within character limit
            if len(description) > 120:
                description = description[:117] + "..."
            
            self.memory.generated_description = description
            self.memory.conversation_history.append({
                "step": "music_description",
                "input": analysis_result,
                "output": description
            })
            
            print("Generated music description:", description)
            return description
            
        except Exception as e:
            print(f"Error generating music description: {e}")
            return f"Error: {e}"
    
    def generate_music_with_suno(self, lyrics: str, style_description: str, 
                                title: str = "AI Generated Song", 
                                callback_url: str = "https://api.example.com/callback") -> Dict[str, Any]:
        """Call Suno API to generate music with lyrics and style"""
        
        if not self.suno_api_key:
            return {
                "status": "mock",
                "message": "Suno API key not configured, this is a mock result",
                "lyrics": lyrics,
                "style_description": style_description,
                "title": title
            }
        
        # Suno API endpoint
        suno_endpoint = "https://apibox.erweima.ai/api/v1/generate"
        
        # 使用custom mode以获得更好的控制
        payload = {
            "prompt": lyrics,  # 歌词作为主要prompt
            "customMode": True,
            "instrumental": False,  # 带歌词的歌曲
            "model": "V3_5",
            "style": style_description,  # 音乐风格描述
            "title": title,
            "callBackUrl": callback_url
        }
        
        headers = {
            "Authorization": f"Bearer {self.suno_api_key}",
            "Content-Type": "application/json"
        }
        
        try:
            print(f"Calling Suno API with:")
            print(f"Title: {title}")
            print(f"Style: {style_description}")
            print(f"Lyrics preview: {lyrics[:100]}...")
            
            response = requests.post(suno_endpoint, json=payload, headers=headers)
            
            print("Suno API response status:", response.status_code)
            
            if response.status_code == 200:
                result = response.json()
                print("Suno API response:", result)
            else:
                result = {
                    "error": f"HTTP {response.status_code}",
                    "message": response.text
                }
                print("Suno API error:", result)
            
            self.memory.conversation_history.append({
                "step": "music_generation",
                "input": {
                    "lyrics": lyrics, 
                    "style": style_description, 
                    "title": title,
                    "settings": payload
                },
                "output": result
            })
            
            return result
            
        except Exception as e:
            print(f"Suno API call failed: {e}")
            return {"error": str(e)}
    
    def execute_full_pipeline(self, image_paths: List[str], location: str, 
                             generate_music: bool = False, 
                             song_title: str = "AI Generated Song") -> Dict[str, Any]:
        """Execute the complete music generation pipeline"""
        
        print("Starting music generation pipeline...")
        
        # Step 1: Analyze images and location
        print("Step 1: Analyzing images and location...")
        analysis = self.analyze_images_and_location(image_paths, location)
        
        if "error" in analysis:
            return {"error": "Analysis step failed", "details": analysis}
        
        # Step 2: Generate lyrics
        print("Step 2: Generating lyrics...")
        lyrics = self.generate_lyrics(analysis)
        
        if "Error" in lyrics:
            return {"error": "Lyrics generation failed", "details": lyrics}
        
        # Step 3: Generate music description
        print("Step 3: Generating music style description...")
        music_description = self.generate_music_description(analysis)
        
        result = {
            "success": True,
            "analysis": analysis,
            "lyrics": lyrics,
            "music_description": music_description,
            "agent_stats": {
                "processing_steps": len(self.memory.conversation_history),
                "extracted_info_keys": list(self.memory.extracted_info.keys())
            }
        }
        
        # Step 4: Generate music (optional)
        if generate_music:
            print("Step 4: Generating music with Suno API...")
            music_result = self.generate_music_with_suno(
                lyrics=lyrics,
                style_description=music_description,
                title=song_title
            )
            result["music_generation"] = music_result
        
        print("Pipeline completed successfully!")
        return result
    
    def get_agent_memory(self) -> AgentMemory:
        """Get Agent's memory state"""
        return self.memory
    
    def reset_memory(self):
        """Reset Agent's memory for new task"""
        self.memory = AgentMemory()

# 简化使用函数
def generate_music_from_images(image_paths: List[str], location: str,
                              gemini_api_key: str, suno_api_key: Optional[str] = None,
                              generate_music: bool = False, song_title: str = "AI Generated Song"):
    """
    Simplified function to generate music from images and location

    Args:
        image_paths: List of paths to image files
        location: Geographical location string
        gemini_api_key: Your Gemini API key
        suno_api_key: Your Suno API key (optional)
        generate_music: Whether to actually call Suno API to generate music
        song_title: Title for the generated song

    Returns:
        Dictionary containing the generated music result
    """
    print(f"Generating music for {len(image_paths)} images at {location}")
    agent = MusicGenerationAgent(gemini_api_key, suno_api_key)
    return agent.execute_full_pipeline(image_paths, location, generate_music, song_title)

# 示例使用代码
if __name__ == "__main__":
    # 示例配置
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    SUNO_API_KEY = os.getenv("SUNO_API_KEY")
    
    # 示例图片路径和位置
    image_paths = ["example1.jpg", "example2.jpg"]
    location = "Tokyo, Japan"
    
    # 运行完整流程
    result = generate_music_from_images(
        image_paths=image_paths,
        location=location,
        gemini_api_key=GEMINI_API_KEY,
        suno_api_key=SUNO_API_KEY,
        generate_music=True,  # 设置为True来实际生成音乐
        song_title="tune street"
    )
    
    print("\n=== 生成结果 ===")
    print(json.dumps(result, indent=2, ensure_ascii=False))