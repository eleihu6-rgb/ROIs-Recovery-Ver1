#ifndef _NEWRULEENGINE_CONSTANTS_H_
#define _NEWRULEENGINE_CONSTANTS_H_

#include <string>

namespace RuleParamConstant {

	const static std::string ALL = "*"; //参数通配符,表示任意值

	const static std::string IGNORED = "*"; //忽略该参数

	const static std::string IGNORED_2 = "0"; //忽略该参数

	const static std::string OR = "|"; //OR操作符

	const static std::string RANGE = "-"; //范围分隔符操作符，lower-upper 表示大于等于lower，小于upper

	const static std::string YES = "Y";

	const static std::string NO = "N";

}

namespace AcclimatizationState {

	const static std::string INIT = "D"; //初始状态

	const static std::string ACCLIMATIZED = "A"; //适应状态

	const static std::string UNKNOWN = "U"; //未知状态
}

namespace AcclimatizationLocation {

	const static std::string CURRENT = "C"; //适应Duty当前地点

	const static std::string LAST = "L"; //适应最近适应状态的Duty地点
}

//EASA(欧洲航空安全局) 适应状态
namespace AcclimatizationStateOfEASA {

	const static std::string INIT = "D"; //初始状态

	const static std::string ACCLIMATIZED_CURRENT = "D"; //适应状态, 适应Duty当前出发地点时区
	const static std::string ACCLIMATIZED_CURRENT_ALIAS = "A"; //适应状态, 适应Duty当前出发地点时区(别名)

	const static std::string ACCLIMATIZED_PREV = "B"; //适应状态, 适应前一个Duty出发地点时区

	const static std::string UNKNOWN = "X"; //未知状态
}

//系统默认内置的任务类型组
namespace DefaultAssignmentGroup {

	const static std::string FLY = "FLY"; //System Default Fly Duty

	const static std::string MVO = "MVO"; //Moving Operation Group

	const static std::string MVP = "MVP"; //Moving Operation Position

	const static std::string SBY = "SBY"; //System Default Standby Duty

	const static std::string GND = "GND"; //System Default Ground Duty

	const static std::string REST = "REST"; //System Default Rest Group

	const static std::string DO = "DO"; //System standard Days Off

	const static std::string AL = "AL"; //System Default Annual Leave

	const static std::string LEA = "LEA"; //Leave Training

	const static std::string RST = "RST"; //System Default RST

	const static std::string SIM = "SIM"; //SIM Training

	const static std::string DHD = "DHD"; //DHD

	const static std::string TRAINING = "TRAINING"; //Training
}

//位移方向
namespace DisplacementDirection {

	const static std::string WEST = "W"; //先西飞行

	const static std::string EAST = "E"; //先东飞行


}

//机场休息设施等级
namespace StationRestFacilty {

	const static std::string NONE = "N"; //无睡眠设施，默认值

	const static std::string SLEEP = "S"; //舒适睡眠设施

	const static std::string REST = "R"; //舒适休息设施，SLEEP等级高于REST


}

namespace RosterSource {

	const static std::string PA = "PA"; //手工预占PreAssign

	const static std::string CR = "CR"; //
}


namespace WeekdayStartFrom {
	const static std::string MON = "MON"; //每周第一天是 周一

	const static std::string SUN = "SUN"; //每周第一天是 周日
};

namespace FlightTimeType {
	const static std::string BH = "BH"; //飞行时间 Block Time/Block Hour/Flight Time

	const static std::string FDP = "FDP"; //飞行执勤期 Flight Duty Period

	const static std::string DP = "DP"; //执勤期 Duty Period
};

namespace TrainingRole {

	const static std::string TE = "TE"; //学员

	const static std::string PNR = "PNR"; //伙伴

	const static std::string IP = "IP"; //教员

	const static std::string CK = "CK"; //检查员
};

namespace CourseType {

	const static std::string SIM = "SIM"; //模拟机课程

	const static std::string GROUND = "GROUND"; //地面课程

	const static std::string LINE = "LINE"; //Line课程

};

namespace RuleClassType {

	const static std::string PO = "P"; //仅PO

	const static std::string RO = "R"; //仅RO

	const static std::string BOTH = "B"; //PO和RO都支持

};

#endif //_NEWRULEENGINE_CONSTANTS_H_
