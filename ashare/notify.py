import requests
import smtplib
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
import os


class PushNotifier:
    """推送通知类 - 支持多种推送方式"""
    
    def __init__(self):
        # Server酱配置
        self.serverchan_key = os.environ.get('SERVERCHAN_KEY')
        
        # 邮件配置
        self.email_config = {
            'smtp_server': os.environ.get('SMTP_SERVER', 'smtp.qq.com'),
            'smtp_port': int(os.environ.get('SMTP_PORT', '587')),
            'sender_email': os.environ.get('SENDER_EMAIL'),
            'sender_password': os.environ.get('SENDER_PASSWORD'),
            'receiver_email': os.environ.get('RECEIVER_EMAIL')
        }
        
        # 企业微信配置
        self.work_wechat_config = {
            'webhook_url': os.environ.get('WORK_WECHAT_WEBHOOK')
        }

    def format_analysis_summary(self, analysis_data, stock_name, stock_code):
        """格式化分析摘要"""
        try:
            basic_data = analysis_data.get('基础数据', {})
            current_price = basic_data.get('最新收盘价', 'N/A')
            change_pct = basic_data.get('涨跌幅', 'N/A')
            
            # 获取关键技术指标
            indicators = analysis_data.get('技术指标', {})
            trend_indicators = indicators.get('趋势指标', {})
            oscillator_indicators = indicators.get('摆动指标', {})
            
            macd = trend_indicators.get('MACD (指数平滑异同移动平均线)', 'N/A')
            rsi = oscillator_indicators.get('RSI (相对强弱指标)', 'N/A')
            
            # 获取交易建议
            signals = analysis_data.get('技术分析建议', [])
            top_signals = signals[:3]  # 取前3个信号
            
            # AI分析摘要
            ai_summary = ""
            if "AI分析结果" in analysis_data:
                ai_analysis = analysis_data["AI分析结果"]
                if "投资建议" in ai_analysis:
                    ai_summary = f"\n🤖 AI建议：{ai_analysis['投资建议'][:100]}..."
            
            summary = f"""
📊 {stock_name} ({stock_code}) 分析报告

💰 当前价格：{current_price}
📈 涨跌幅：{change_pct}

🔧 关键指标：
• MACD：{macd}
• RSI：{rsi}

⚡ 交易信号：
{chr(10).join([f"• {signal}" for signal in top_signals])}
{ai_summary}

⏰ 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
            """.strip()
            
            return summary
        except Exception as e:
            return f"格式化分析数据时出错: {str(e)}"

    def push_to_serverchan(self, title, content):
        """通过Server酱推送到微信"""
        if not self.serverchan_key:
            print("❌ Server酱推送失败：未配置SERVERCHAN_KEY")
            return False
            
        try:
            url = f"https://sctapi.ftqq.com/{self.serverchan_key}.send"
            data = {
                'title': title,
                'desp': content
            }
            
            response = requests.post(url, data=data, timeout=10)
            result = response.json()
            
            if response.status_code == 200 and result.get('code') == 0:
                print("✅ Server酱微信推送成功")
                return True
            else:
                print(f"❌ Server酱推送失败：{result.get('message', '未知错误')}")
                return False
                
        except Exception as e:
            print(f"❌ Server酱推送异常：{str(e)}")
            return False

    def push_to_email(self, subject, content):
        """邮件推送"""
        config = self.email_config
        if not all([config['sender_email'], config['sender_password'], config['receiver_email']]):
            print("❌ 邮件推送失败：邮件配置不完整")
            return False
            
        try:
            msg = MIMEMultipart()
            msg['From'] = config['sender_email']
            msg['To'] = config['receiver_email']
            msg['Subject'] = subject
            
            msg.attach(MIMEText(content, 'plain', 'utf-8'))
            
            server = smtplib.SMTP(config['smtp_server'], config['smtp_port'])
            server.starttls()
            server.login(config['sender_email'], config['sender_password'])
            server.send_message(msg)
            server.quit()
            
            print("✅ 邮件推送成功")
            return True
            
        except Exception as e:
            print(f"❌ 邮件推送失败：{str(e)}")
            return False

    def push_to_work_wechat(self, content):
        """企业微信推送"""
        webhook_url = self.work_wechat_config['webhook_url']
        if not webhook_url:
            print("❌ 企业微信推送失败：未配置WORK_WECHAT_WEBHOOK")
            return False
            
        try:
            data = {
                "msgtype": "text",
                "text": {
                    "content": content
                }
            }
            
            response = requests.post(webhook_url, json=data, timeout=10)
            result = response.json()
            
            if response.status_code == 200 and result.get('errcode') == 0:
                print("✅ 企业微信推送成功")
                return True
            else:
                print(f"❌ 企业微信推送失败：{result.get('errmsg', '未知错误')}")
                return False
                
        except Exception as e:
            print(f"❌ 企业微信推送异常：{str(e)}")
            return False

    def send_analysis_notification(self, analysis_data, stock_name, stock_code, push_methods=['serverchan']):
        """发送分析通知"""
        title = f"📊 {stock_name} 股票分析报告"
        content = self.format_analysis_summary(analysis_data, stock_name, stock_code)
        
        success_count = 0
        total_methods = len(push_methods)
        
        for method in push_methods:
            if method == 'serverchan':
                if self.push_to_serverchan(title, content):
                    success_count += 1
            elif method == 'email':
                if self.push_to_email(title, content):
                    success_count += 1
            elif method == 'work_wechat':
                if self.push_to_work_wechat(content):
                    success_count += 1
            else:
                print(f"❌ 未知的推送方式：{method}")
        
        if success_count > 0:
            print(f"🎉 推送成功：{success_count}/{total_methods} 个方式成功")
            return True
        else:
            print("❌ 所有推送方式都失败了")
            return False

    def format_alert_event(self, event):
        """格式化结构化监控告警。"""
        payload = event.raw_payload if isinstance(event.raw_payload, dict) else {}
        extra_lines = []

        if event.event_type == "news":
            keywords = payload.get("keyword_hits") or []
            if keywords:
                extra_lines.append(f"命中关键词: {', '.join(keywords)}")
            if payload.get("url"):
                extra_lines.append(f"链接: {payload['url']}")
        elif event.event_type == "fund_flow":
            reasons = payload.get("triggered_reasons") or []
            if reasons:
                extra_lines.append(f"触发原因: {'；'.join(reasons)}")

        body = [
            f"股票: {event.stock_name} ({event.stock_code})",
            f"类型: {event.event_type}",
            f"来源: {event.source}",
            f"时间: {event.occurred_at}",
            f"优先级: {event.priority}/5",
            "",
            event.summary,
        ]
        body.extend(extra_lines)
        return "\n".join(body).strip()

    def send_alert_event(self, event, push_methods=None):
        """发送实时监控告警。"""
        push_methods = push_methods or ['serverchan']
        title = f"🔔 {event.title}"
        content = self.format_alert_event(event)

        success_count = 0
        for method in push_methods:
            if method == 'serverchan':
                if self.push_to_serverchan(title, content):
                    success_count += 1
            elif method == 'email':
                if self.push_to_email(title, content):
                    success_count += 1
            elif method == 'work_wechat':
                if self.push_to_work_wechat(content):
                    success_count += 1

        return success_count > 0


def setup_serverchan_guide():
    """Server酱设置指南"""
    guide = """
🔧 Server酱微信推送设置指南：

1️⃣ 访问 https://sct.ftqq.com/
2️⃣ 用GitHub账号登录
3️⃣ 点击"发送消息"，获取SendKey
4️⃣ 用微信扫码关注"方糖服务号"
5️⃣ 设置环境变量：
   export SERVERCHAN_KEY="你的SendKey"

📧 邮件推送设置（可选）：
   export SMTP_SERVER="smtp.qq.com"
   export SMTP_PORT="587"
   export SENDER_EMAIL="你的邮箱@qq.com"
   export SENDER_PASSWORD="你的邮箱授权码"
   export RECEIVER_EMAIL="接收邮箱@qq.com"

🏢 企业微信推送设置（可选）：
   export WORK_WECHAT_WEBHOOK="你的企业微信机器人webhook地址"
    """
    print(guide)


if __name__ == "__main__":
    # 测试推送功能
    setup_serverchan_guide()
    
    # 测试数据
    test_data = {
        '基础数据': {
            '最新收盘价': '33.88',
            '涨跌幅': '+2.5%'
        },
        '技术指标': {
            '趋势指标': {'MACD (指数平滑异同移动平均线)': '1.23'},
            '摆动指标': {'RSI (相对强弱指标)': '55.83'}
        },
        '技术分析建议': ['当前处于上升趋势', 'RSI显示中性偏强']
    }
    
    notifier = PushNotifier()
    notifier.send_analysis_notification(test_data, "中国稀土", "sz000831") 
