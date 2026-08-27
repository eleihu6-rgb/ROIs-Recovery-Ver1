build_dir="../db/build"
while getopts :r:D: opt
do
    case "$opt" in
        r) echo "deal -r option: rebuild or build, with value $OPTARG"
            rebuild="$OPTARG";;
        D) echo "deal -D option: CMAKE_BUILD_TYPE, with value $OPTARG"
	    build_type="$OPTARG";;
	*) echo "Unknow option";;
    esac
done
    case "$build_type" in
	Debug) dir="../db/build/Debug";;
        Release) dir="../db/build/Release";;
	*) dir="../db/build/Other";;
    esac
if [ ! -d "$build_dir" ]; then
    mkdir "$build_dir"
fi
if [ ! -d "$dir" ]; then
    mkdir "$dir"
fi
    case "$rebuild" in
	true) echo "rebuild"
	    [ -d "$dir" ] && rm -rf "$dir"
	    mkdir "$dir";;
	false) echo "un rebuild";;
    esac
cd "$dir"
cmake ../.. -DCMAKE_BUILD_TYPE="$build_type"
make
