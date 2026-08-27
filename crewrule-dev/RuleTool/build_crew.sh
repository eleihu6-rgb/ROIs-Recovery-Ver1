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

orUril_sh="../orUtil/build_crew.sh"
./"$orUril_sh" -r "$rebuild" -D "$build_type"
db_sh="../db/build_crew.sh"
./"$db_sh" -r "$rebuild" -D "$build_type"
RuleEngine_sh="../RuleEngine/build_crew.sh"
./"$RuleEngine_sh" -r "$rebuild" -D "$build_type"
RuleTool_sh="./build.sh"
./"$RuleTool_sh" -r "$rebuild" -D "$build_type"

