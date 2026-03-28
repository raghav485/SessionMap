from .helper import VALUE
from app.package.worker import Worker
import requests


def run():
    return VALUE + Worker().value
