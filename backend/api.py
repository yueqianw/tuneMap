from flask import Flask, request, jsonify, send_file, g
from flask_cors import CORS
import os
import tempfile
import shutil
import traceback
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

# 创建临时文件夹存储上传的图片和生成的音频
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp_uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# 允许的图片文件扩展名
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# 请求结束后清理临时目录
@app.teardown_request
def cleanup_temp_dir(exc):
    temp_dir = getattr(g, 'temp_dir', None)
    if temp_dir and os.path.exists(temp_dir):
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as e:
            app.logger.error(f"Failed to cleanup temp directory: {e}")

@app.before_request
def make_temp_dir():
    # 在每个请求前创建一个隔离 temp 目录
    g.temp_dir = tempfile.mkdtemp(dir=UPLOAD_FOLDER)

@app.route('/api/generate-music', methods=['POST'])
def api_generate_music():
    try:
        # ---- 延迟导入，避免容器启动时卡住 ----
        from music_generate import generate_music
        # ---------------------------------------

        # 从 g.temp_dir 获取当前请求专属临时目录
        temp_dir = g.temp_dir
        image_paths = []

        # 校验上传文件
        if 'images' not in request.files:
            return jsonify({'error': 'No image files uploaded'}), 400

        # 读取坐标
        try:
            lat = float(request.form.get('latitude'))
            lon = float(request.form.get('longitude'))
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid coordinate format'}), 400

        # 可选参数：风格、是否精炼描述
        style_override = request.form.get('style')
        refine_description = request.form.get('refine_description', 'true').lower() == 'true'

        # 可选参数：生成时长（秒）
        try:
            duration_sec = int(request.form.get('duration_sec', 30))
        except ValueError:
            return jsonify({'error': 'Invalid duration_sec'}), 400

        # 保存上传的图片
        images = request.files.getlist('images')
        for image in images:
            if image and allowed_file(image.filename):
                filename = secure_filename(image.filename)
                filepath = os.path.join(temp_dir, filename)
                image.save(filepath)
                image_paths.append(filepath)

        if not image_paths:
            return jsonify({'error': 'No valid image files'}), 400

        # 生成输出文件路径
        output_file = os.path.join(temp_dir, 'generated_music.wav')

        # 调用核心生成函数，传入 duration_sec
        result_path = generate_music(
            image_paths=image_paths,
            coords=(lat, lon),
            output_wav=output_file,
            style_override=style_override,
            refine_description=refine_description,
            duration_sec=duration_sec
        )

        # 返回音频
        return send_file(
            result_path,
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

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'service': 'music-generator'}), 200

if __name__ == '__main__':
    # 本地开发模式：关闭 reloader，避免双重加载
    app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False)
