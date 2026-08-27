rem 清理工程文件 .obj/ .pdb/ debug/ release

For /f "delims=" %%i in ('dir /a /b /s  *.obj') do @del /a /s "%%i"

For /f "delims=" %%i in ('dir /a /b /s  *.pdb') do @del /a /s "%%i"

For /f "delims=" %%i in ('dir /a /b /s  *.ncb') do @del /a /s "%%i"

For /f "delims=" %%i in ('dir /a /b /s  *.suo') do @del /a /s "%%i"

for /f "delims=" %%x in ('dir /s /b /ad *debug') do @rd /s /q "%%x"

for /f "delims=" %%x in ('dir /s /b /ad *release') do @rd /s /q "%%x"

for /f "delims=" %%x in ('dir /s /b /ad *dev') do @rd /s /q "%%x"

for /f "delims=" %%x in ('dir /s /b /ad *snap') do @rd /s /q "%%x"

for /f "delims=" %%x in ('dir /s /b /ad *ReleaseMinDependency') do @rd /s /q "%%x"