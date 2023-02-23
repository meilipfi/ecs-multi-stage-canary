from flask import Flask, render_template
import random

app = Flask(__name__)

@app.route('/')
def index():
    url = ""
    return render_template('mini-car-game.html', url=url)

@app.route('/app/123/<username>')
def stable(username):
    url = username
    return render_template('mini-car-game.html', url=url)

@app.errorhandler(404)
def page_not_found(e):
    # note that we set the 404 status explicitly
    return render_template('404.html'), 404

if __name__ == "__main__":
    app.run(host="0.0.0.0")