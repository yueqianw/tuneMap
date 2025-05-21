from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import tempfile
import shutil
from werkzeug.utils import secure_filename
import traceback

print("DEBUG: (1) loading music_generate ...")
from music_generate import generate_music  # 导入现有的音乐生成模块
print("DEBUG: (2) music_generate loaded.")

app = Flask(__name__)
CORS(app)  # 允许跨域请求，这对React前端很重要

# 创建临时文件夹存储上传的图片和生成的音频
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp_uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# 允许的图片文件扩展名
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# 使用应用上下文来存储需要清理的临时目录
@app.after_request
def cleanup_after_request(response):
    # 只在请求上下文中有需要清理的临时目录时执行清理
    if hasattr(request, 'cleanup_dir') and request.cleanup_dir:
        try:
            # 添加延迟清理策略 - 在生产环境中可以使用更复杂的方案
            # 这里简单实现，实际可能需要后台任务
            @response.call_on_close
            def cleanup_temp():
                try:
                    if os.path.exists(request.cleanup_dir):
                        shutil.rmtree(request.cleanup_dir)
                except Exception as e:
                    app.logger.error(f"Failed to cleanup temp directory: {e}")
        except Exception as e:
            app.logger.error(f"Error setting up cleanup: {e}")
    return response

@app.route('/api/generate-music', methods=['POST'])
def api_generate_music():
    temp_dir = None
    try:
        # 创建临时目录存储上传的图片
        print("DEBUG: (A) api_generate_music started...")
        temp_dir = tempfile.mkdtemp(dir=UPLOAD_FOLDER)
        # 保存临时目录路径到请求上下文，以便后续清理
        request.cleanup_dir = temp_dir
        
        image_paths = []
        
        # 验证是否有文件和坐标
        if 'images' not in request.files:
            return jsonify({'error': 'No image files uploaded'}), 400
        
        # 获取坐标
        try:
            lat = float(request.form.get('latitude'))
            lon = float(request.form.get('longitude'))
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid coordinate format'}), 400
        
        # 获取可选参数
        style_override = request.form.get('style')
        refine_description = request.form.get('refine_description', 'true').lower() == 'true'
        
        # 处理上传的图片
        print("DEBUG: (B) Processing uploaded images...")
        images = request.files.getlist('images')
        for image in images:
            if image and allowed_file(image.filename):
                filename = secure_filename(image.filename)
                filepath = os.path.join(temp_dir, filename)
                image.save(filepath)
                image_paths.append(filepath)
        
        if not image_paths:
            return jsonify({'error': 'No valid image files'}), 400
        
        # 创建临时输出文件
        output_file = os.path.join(temp_dir, 'generated_music.wav')
        
        # 生成音乐
        print(f"DEBUG: (C) Generating music with {len(image_paths)} images, coords=({lat}, {lon})...")
        result = generate_music(
            image_paths=image_paths,
            coords=(lat, lon),
            output_wav=output_file,
            style_override=style_override,
            refine_description=refine_description
        )
        print(f"DEBUG: (D) Music generation completed: {result}")
        
        # 返回生成的音频文件
        return send_file(
            result, 
            mimetype='audio/wav', 
            as_attachment=True,
            download_name='generated_music.wav'
        )
        
    except FileNotFoundError as e:
        app.logger.error(f"File not found: {e}")
        return jsonify({'error': 'Required file not found', 'details': str(e)}), 404
    except ValueError as e:
        app.logger.error(f"Value error: {e}")
        return jsonify({'error': 'Invalid parameter value', 'details': str(e)}), 400
    except Exception as e:
        app.logger.error(f"Error generating music: {e}\n{traceback.format_exc()}")
        return jsonify({'error': 'Failed to generate music', 'details': str(e)}), 500

# 添加健康检查端点
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'service': 'music-generator'}), 200

if __name__ == '__main__':
    # 在开发环境中使用debug模式
    print("DEBUG: (3) Starting Flask app...")
    app.run(debug=True, host='0.0.0.0', port=5000)
    print("DEBUG: (4) Flask app terminated.")