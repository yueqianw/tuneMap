# app.py
from dotenv import load_dotenv

load_dotenv()

from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import uuid
import os
from datetime import datetime
import json
from music_agent import MusicGenerationAgent
import threading
from typing import List, Dict, Any
from werkzeug.utils import secure_filename
import shutil
import time
import requests

app = Flask(__name__)
CORS(app)

# 数据库配置
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///music_generation.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 文件上传配置
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB per file

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# 确保上传目录存在
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

db = SQLAlchemy(app)

# 数据库模型
class MusicTask(db.Model):
    """音乐生成任务表"""
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(100), nullable=True)  # 用户ID
    location = db.Column(db.String(200), nullable=False)
    image_paths = db.Column(db.Text, nullable=False)  # JSON格式存储图片路径列表

    # 任务状态
    status = db.Column(db.String(50), default='pending')  # pending, analyzing, generating, completed, failed
    progress = db.Column(db.Integer, default=0)  # 进度百分比 0-100

    # AI分析结果
    analysis_result = db.Column(db.Text, nullable=True)  # JSON格式
    music_description = db.Column(db.Text, nullable=True)

    # Suno API相关
    suno_task_id = db.Column(db.String(100), nullable=True)
    suno_response = db.Column(db.Text, nullable=True)  # JSON格式存储完整响应

    # 生成的音乐信息
    music_urls = db.Column(db.Text, nullable=True)  # JSON格式存储多个URL
    selected_music_url = db.Column(db.String(500), nullable=True)  # 选择的第一个URL
    music_title = db.Column(db.String(200), nullable=True)
    music_duration = db.Column(db.Integer, nullable=True)  # 音乐时长（秒）

    # 时间戳
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)

    # 错误信息
    error_message = db.Column(db.Text, nullable=True)

    def to_dict(self, include_details=False):
        """转换为字典格式"""
        basic_info = {
            'task_id': self.id,
            'user_id': self.user_id,
            'location': self.location,
            'status': self.status,
            'progress': self.progress,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

        if include_details:
            basic_info.update({
                'music_description': self.music_description,
                'music_title': self.music_title,
                'music_duration': self.music_duration,
                'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            })

            # 如果任务完成，包含音乐信息
            if self.status == 'completed':
                basic_info.update({
                    'music_url': self.selected_music_url,
                    'music_urls': json.loads(self.music_urls) if self.music_urls else [],
                    'sono_response':json.loads(self.suno_response) if self.suno_response else None,
                })

                # 如果有分析结果，也包含进来
                if self.analysis_result:
                    try:
                        basic_info['analysis'] = json.loads(self.analysis_result)
                    except:
                        pass

            # 如果任务失败，包含错误信息
            elif self.status == 'failed':
                basic_info['error_message'] = self.error_message

        return basic_info

class CallbackLog(db.Model):
    """回调日志表"""
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.String(36), db.ForeignKey('music_task.id'), nullable=False)
    callback_type = db.Column(db.String(50), nullable=False)  # text, first, complete
    callback_data = db.Column(db.Text, nullable=False)  # JSON格式
    received_at = db.Column(db.DateTime, default=datetime.utcnow)

# 创建数据库表
with app.app_context():
    db.create_all()

# 初始化音乐生成代理
agent = MusicGenerationAgent(
    gemini_api_key=os.getenv('GEMINI_API_KEY'),
    suno_api_key=os.getenv('SUNO_API_KEY')
)

def allowed_file(filename):
    """检查文件扩展名是否允许"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_unique_filename(original_filename):
    """生成唯一的文件名"""
    filename = secure_filename(original_filename)
    name, ext = os.path.splitext(filename)
    unique_name = f"{name}_{uuid.uuid4().hex[:8]}{ext}"
    return unique_name

def update_task_progress(task_id, progress, status=None):
    """更新任务进度"""
    try:
        with app.app_context():
            task = MusicTask.query.get(task_id)
            if task:
                task.progress = progress
                if status:
                    task.status = status
                db.session.commit()
    except Exception as e:
        print(f"Error updating task progress: {e}")

def poll_suno_task_status(task_id: str, suno_task_id: str):
    """轮询Suno任务状态"""
    max_attempts = 30  # 最多轮询30次（10分钟）
    attempt = 0
    
    while attempt < max_attempts:
        try:
            with app.app_context():
                task = MusicTask.query.get(task_id)
                if not task or task.status in ['completed', 'failed']:
                    break
                
                # 调用获取音乐生成详情API
                try:
                    response = requests.get(
                        f"https://apibox.erweima.ai/api/v1/generate/record-info",
                        params={'taskId': suno_task_id},
                        headers={
                            'Authorization': f'Bearer {os.getenv("SUNO_API_KEY")}',
                            'Content-Type': 'application/json'
                        },
                        timeout=30  # 设置请求超时
                    )
                except requests.exceptions.RequestException as e:
                    print(f"Request error polling task {task_id}: {e}")
                    attempt += 1
                    time.sleep(20)
                    continue
                
                if response.status_code == 200:
                    try:
                        result = response.json()
                        print(f"sono_task_status_response {result}")  # 调试输出
                    except json.JSONDecodeError as e:
                        print(f"JSON decode error for task {task_id}: {e}, response: {response.text}")
                        attempt += 1
                        time.sleep(20)
                        continue
                    
                    if not result:
                        print(f"Empty response for task {task_id}")
                        attempt += 1
                        time.sleep(20)
                        continue
                    
                    if result.get('code') == 200:
                        data = result.get('data')
                        if not data:
                            print(f"No data in response for task {task_id}")
                            attempt += 1
                            time.sleep(20)
                            continue
                        
                        # 修正：状态在 data 层级，不是在 response 层级
                        status = data.get('status', 'PENDING')
                        response_data = data.get('response', {})
                        
                        print(f"Polling attempt {attempt + 1}, task: {task_id}, suno_task: {suno_task_id}, status: {status}")
                        
                        # 更新任务状态和进度
                        if status == 'PENDING':
                            task.progress = 70
                        elif status == 'TEXT_SUCCESS':
                            task.progress = 80
                        elif status == 'FIRST_SUCCESS':
                            task.progress = 90
                        elif status == 'SUCCESS':
                            # 任务完成，提取音乐信息
                            suno_data = response_data.get('sunoData', [])
                            if suno_data:
                                # 提取所有音频URL - 使用 sourceAudioUrl
                                music_urls = []
                                for clip in suno_data:
                                    source_audio_url = clip.get('sourceAudioUrl')
                                    if source_audio_url:
                                        music_urls.append(source_audio_url)
                                
                                if music_urls:
                                    # 保存音乐信息
                                    task.music_urls = json.dumps(music_urls)
                                    task.selected_music_url = music_urls[0]
                                    
                                    # 设置标题和时长
                                    first_clip = suno_data[0]
                                    if first_clip.get('title'):
                                        task.music_title = first_clip['title']
                                    if first_clip.get('duration'):
                                        try:
                                            # duration 可能是浮点数，转换为整数
                                            task.music_duration = int(float(first_clip['duration']))
                                        except (ValueError, TypeError):
                                            task.music_duration = None
                                    
                                    task.status = 'completed'
                                    task.progress = 100
                                    task.completed_at = datetime.utcnow()
                                    
                                    # 保存完整的Suno响应
                                    task.suno_response = json.dumps(data)
                                    
                                    print(f"Task {task_id} completed successfully with {len(music_urls)} tracks")
                                    print(f"Selected music URL: {task.selected_music_url}")
                                    print(f"All music URLs: {music_urls}")
                                else:
                                    task.status = 'failed'
                                    task.error_message = 'No valid audio URLs received'
                                    task.progress = 0
                                    print(f"Task {task_id} failed: no valid audio URLs")
                            else:
                                task.status = 'failed'
                                task.error_message = 'No audio clips received'
                                task.progress = 0
                                print(f"Task {task_id} failed: no audio clips")
                            
                            db.session.commit()
                            break
                            
                        elif status in ['CREATE_TASK_FAILED', 'GENERATE_AUDIO_FAILED', 'CALLBACK_EXCEPTION', 'SENSITIVE_WORD_ERROR']:
                            # 任务失败
                            error_code = data.get('errorCode')
                            error_message = data.get('errorMessage', f'Task failed with status: {status}')
                            if error_code:
                                error_message = f"Error {error_code}: {error_message}"
                            
                            task.status = 'failed'
                            task.error_message = error_message
                            task.progress = 0
                            db.session.commit()
                            print(f"Task {task_id} failed: {error_message}")
                            break
                        
                        # 保存进度更新
                        db.session.commit()
                        
                    else:
                        # API返回错误
                        error_msg = result.get('msg', 'Unknown API error')
                        print(f"API error for task {task_id}: {error_msg}")
                        
                        # 如果是认证错误或其他严重错误，直接失败
                        if result.get('code') in [401, 403, 404]:
                            task.status = 'failed'
                            task.error_message = f"API error: {error_msg}"
                            task.progress = 0
                            db.session.commit()
                            break
                            
                else:
                    print(f"HTTP error polling task {task_id}: {response.status_code}, response: {response.text}")
                    
                    # 如果是认证错误，直接失败
                    if response.status_code in [401, 403]:
                        task.status = 'failed'
                        task.error_message = f"Authentication error: {response.status_code}"
                        task.progress = 0
                        db.session.commit()
                        break
                
                # 等待20秒后再次轮询
                time.sleep(20)
                attempt += 1
                
        except Exception as e:
            print(f"Error polling task status for {task_id}: {e}")
            import traceback
            traceback.print_exc()
            attempt += 1
            time.sleep(20)
    
    # 如果超过最大尝试次数，标记任务为失败
    if attempt >= max_attempts:
        try:
            with app.app_context():
                task = MusicTask.query.get(task_id)
                if task and task.status not in ['completed', 'failed']:
                    task.status = 'failed'
                    task.error_message = f'Polling timeout: task took too long to complete after {max_attempts} attempts'
                    task.progress = 0
                    db.session.commit()
                    print(f"Task {task_id} failed due to timeout after {max_attempts} attempts")
        except Exception as e:
            print(f"Error updating task after timeout: {e}")

def process_music_generation_async(task_id: str):
    """异步处理音乐生成任务"""
    try:
        with app.app_context():
            task = MusicTask.query.get(task_id)
            if not task:
                return

            # 更新状态为分析中
            task.status = 'analyzing'
            task.progress = 10
            db.session.commit()

            # 解析图片路径
            image_paths = json.loads(task.image_paths)

            # 验证图片文件是否存在
            valid_image_paths = []
            for path in image_paths:
                if os.path.exists(path):
                    valid_image_paths.append(path)
                else:
                    print(f"Warning: Image file not found: {path}")

            if not valid_image_paths:
                task.status = 'failed'
                task.error_message = "No valid image files found"
                db.session.commit()
                return

            # 执行AI分析
            update_task_progress(task_id, 30)
            analysis = agent.analyze_images_and_location(valid_image_paths, task.location)

            if "error" in analysis:
                task.status = 'failed'
                task.error_message = f"Analysis failed: {analysis['error']}"
                db.session.commit()
                return

            # 保存分析结果
            task.analysis_result = json.dumps(analysis)
            print("AI analysis", json.dumps(analysis))
            task.progress = 50
            db.session.commit()

            # 生成音乐描述
            music_description = agent.generate_music_description(analysis)
            music_lyrics=agent.generate_lyrics(analysis)
            task.music_description = music_description
            print("music_description", music_description)

            # 更新状态为生成中
            task.status = 'generating'
            task.progress = 70
            db.session.commit()
            print("generating!!!!!!!!!!")

            # 调用Suno API，使用debug webhook URL
            debug_webhook_url = "https://webhook.site/f7efe110-a865-4fb4-a6f7-2791a73e5d13"
            music_result = agent.generate_music_with_suno(
            lyrics=music_lyrics,
            style_description=music_description,
            callback_url=debug_webhook_url
            )
            print("suno_response", json.dumps(music_result))

            # 检查API调用是否成功
            if "error" in music_result:
                task.status = 'failed'
                task.error_message = f"Music generation failed: {music_result['error']}"
                task.progress = 0
                db.session.commit()
                return

            # 检查返回的数据结构
            if music_result.get('code') != 200:
                task.status = 'failed'
                task.error_message = f"Suno API error: {music_result.get('msg', 'Unknown error')}"
                task.progress = 0
                db.session.commit()
                return

            # 如果是mock模式，直接标记为完成
            if music_result.get("status") == "mock":
                task.status = 'completed'
                task.progress = 100
                task.completed_at = datetime.utcnow()
                # 设置模拟的音乐信息
                task.selected_music_url = "https://example.com/mock-music.mp3"
                task.music_title = "Generated Music"
                task.music_urls = json.dumps(["https://example.com/mock-music.mp3"])
                db.session.commit()
            else:
                # 从正确的位置提取Suno任务ID
                data = music_result.get('data', {})
                suno_task_id = data.get('taskId')
                
                if suno_task_id:
                    task.suno_task_id = suno_task_id
                    # 保存完整的Suno响应
                    task.suno_response = json.dumps(music_result)
                    db.session.commit()
                    
                    # 启动轮询线程
                    polling_thread = threading.Thread(
                        target=poll_suno_task_status,
                        args=(task_id, suno_task_id)
                    )
                    polling_thread.daemon = True
                    polling_thread.start()
                    
                    print(f"Started polling for task {task_id} with suno task {suno_task_id}")
                else:
                    task.status = 'failed'
                    task.error_message = f"No task ID received from Suno API. Response: {json.dumps(music_result)}"
                    task.progress = 0
                    db.session.commit()

    except Exception as e:
        with app.app_context():
            task = MusicTask.query.get(task_id)
            if task:
                task.status = 'failed'
                task.error_message = str(e)
                task.progress = 0
                db.session.commit()
        print(f"Error in async processing: {e}")

@app.route('/api/upload-images', methods=['POST'])
def upload_images():
    """上传图片接口"""
    try:
        # 检查是否有文件
        if 'images' not in request.files:
            return jsonify({'error': 'No images provided'}), 400

        files = request.files.getlist('images')
        if not files or all(f.filename == '' for f in files):
            return jsonify({'error': 'No images selected'}), 400

        uploaded_paths = []

        for file in files:
            if file and file.filename != '':
                # 检查文件类型
                if not allowed_file(file.filename):
                    return jsonify({
                        'error': f'File type not allowed: {file.filename}. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'
                    }), 400

                # 生成唯一文件名
                unique_filename = generate_unique_filename(file.filename)
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)

                # 保存文件
                file.save(filepath)
                uploaded_paths.append(filepath)

        if not uploaded_paths:
            return jsonify({'error': 'No valid images uploaded'}), 400

        return jsonify({
            'success': True,
            'message': f'Successfully uploaded {len(uploaded_paths)} images',
            'image_paths': uploaded_paths,
            'count': len(uploaded_paths)
        })

    except Exception as e:
        # 清理已上传的文件（如果有错误）
        for path in uploaded_paths:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except:
                pass
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate-music', methods=['POST'])
def generate_music():
    """创建音乐生成任务"""
    try:
        data = request.get_json()

        # 验证必需参数
        if not data or not data.get('image_paths') or not data.get('location'):
            return jsonify({
                'error': 'Missing required parameters: image_paths and location'
            }), 400

        image_paths = data['image_paths']
        location = data['location']
        user_id = data.get('user_id')  # 可选参数

        # 验证image_paths是列表
        if not isinstance(image_paths, list) or len(image_paths) == 0:
            return jsonify({
                'error': 'image_paths must be a non-empty array'
            }), 400

        # 验证图片文件是否存在
        missing_files = []
        for path in image_paths:
            if not os.path.exists(path):
                missing_files.append(path)

        if missing_files:
            return jsonify({
                'error': f'Image files not found: {", ".join(missing_files)}'
            }), 400

        # 创建任务记录
        task = MusicTask(
            user_id=user_id,
            location=location,
            image_paths=json.dumps(image_paths),
            status='pending',
            progress=0
        )

        db.session.add(task)
        db.session.commit()

        # 启动异步处理
        thread = threading.Thread(
            target=process_music_generation_async,
            args=(task.id,)
        )
        thread.daemon = True
        thread.start()

        return jsonify({
            'success': True,
            'task_id': task.id,
            'status': 'pending',
            'progress': 0,
            'message': 'Music generation task created successfully'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/task-status/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """获取任务状态"""
    try:
        task = MusicTask.query.get(task_id)
        if not task:
            return jsonify({'error': 'Task not found'}), 404

        return jsonify(task.to_dict(include_details=True))

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/suno-callback/<task_id>', methods=['POST'])
def suno_callback(task_id):
    """处理Suno API回调（仅用于debug）"""
    try:
        callback_data = request.get_json()
        
        print(f"Debug callback received for task {task_id}: {json.dumps(callback_data, indent=2)}")

        # 记录回调日志
        log = CallbackLog(
            task_id=task_id,
            callback_type=callback_data.get('type', 'unknown'),
            callback_data=json.dumps(callback_data)
        )
        db.session.add(log)
        db.session.commit()

        return jsonify({'success': True, 'message': 'Debug callback received'})

    except Exception as e:
        print(f"Debug callback error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks', methods=['GET'])
def list_tasks():
    """获取任务列表"""
    try:
        user_id = request.args.get('user_id')
        status = request.args.get('status')
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))

        query = MusicTask.query

        if user_id:
            query = query.filter_by(user_id=user_id)

        if status:
            query = query.filter_by(status=status)

        tasks = query.order_by(MusicTask.created_at.desc()).offset(offset).limit(limit).all()

        result = [task.to_dict() for task in tasks]

        return jsonify({
            'tasks': result,
            'total': len(result),
            'offset': offset,
            'limit': limit
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/task/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    """删除任务"""
    try:
        task = MusicTask.query.get(task_id)
        if not task:
            return jsonify({'error': 'Task not found'}), 404

        # 删除相关的图片文件
        if task.image_paths:
            try:
                image_paths = json.loads(task.image_paths)
                for path in image_paths:
                    if os.path.exists(path):
                        os.remove(path)
                        print(f"Deleted image file: {path}")
            except Exception as e:
                print(f"Error deleting image files: {e}")

        # 删除相关的回调日志
        CallbackLog.query.filter_by(task_id=task_id).delete()

        # 删除任务
        db.session.delete(task)
        db.session.commit()

        return jsonify({'success': True, 'message': 'Task deleted successfully'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cleanup-files', methods=['POST'])
def cleanup_orphaned_files():
    """清理孤立的文件（可选的维护接口）"""
    try:
        # 获取所有任务中使用的图片路径
        used_paths = set()
        tasks = MusicTask.query.all()

        for task in tasks:
            if task.image_paths:
                try:
                    paths = json.loads(task.image_paths)
                    used_paths.update(paths)
                except:
                    pass

        # 获取上传目录中的所有文件
        upload_dir = app.config['UPLOAD_FOLDER']
        all_files = set()

        for filename in os.listdir(upload_dir):
            filepath = os.path.join(upload_dir, filename)
            if os.path.isfile(filepath):
                all_files.add(filepath)

        # 找出孤立的文件
        orphaned_files = all_files - used_paths

        # 删除孤立的文件
        deleted_count = 0
        for filepath in orphaned_files:
            try:
                os.remove(filepath)
                deleted_count += 1
                print(f"Deleted orphaned file: {filepath}")
            except Exception as e:
                print(f"Error deleting {filepath}: {e}")

        return jsonify({
            'success': True,
            'message': f'Cleaned up {deleted_count} orphaned files',
            'deleted_count': deleted_count,
            'total_files': len(all_files),
            'used_files': len(used_paths)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'database': 'connected',
        'upload_folder': app.config['UPLOAD_FOLDER'],
        'max_file_size': f"{app.config['MAX_CONTENT_LENGTH'] / (1024*1024):.1f}MB"
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    app.run(host='0.0.0.0', port=port, debug=debug)