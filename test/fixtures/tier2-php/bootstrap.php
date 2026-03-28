<?php

require 'src/legacy.php';

use App\Service\Helper;

function run(): Helper
{
    return new Helper();
}
