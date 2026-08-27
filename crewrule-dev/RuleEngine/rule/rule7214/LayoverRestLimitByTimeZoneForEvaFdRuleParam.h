/**
 * @file LayoverRestLimitByTimeZoneForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LAYOVERRESTLIMITBYTIMEZONEFOREVAFDRULEPARAM_H_
#define _LAYOVERRESTLIMITBYTIMEZONEFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckLayoverRestLimitByTimeZoneForEvaFdRule;


class LayoverRestLimitByTimeZoneForEvaFdRuleParam : public RuleParam {
	friend class CheckLayoverRestLimitByTimeZoneForEvaFdRule;
private:
    explicit LayoverRestLimitByTimeZoneForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7214;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 10;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		SEGMENT_ASSIGNMENTS = 4,
		MIN_NUM_OF_PAIRING_DUTY = 5,
		MIN_TIME_ZONE_GAP = 6,
		LAYOVER_MIN_REST = 7,
		SLEEP_CYCLE_START = 8,
		SLEEP_CYCLE_END = 9,
		MIN_SLEEP_CYCLES = 10,
		SEVERITY = 11
    };

	//人员所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//Segment 任务类型,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::vector<std::string> _segmentAssignments{};

	//Pairing中FLY Duty的最小数量
	std::string _strMinNumOfPairingDuty{};
	int _minNumOfPairingDuty{};
	
	//最小时区差,格式：HH:mm。Pairing中任何落地机场与Home Base时区差大于该值则违规
	std::string _minTimeZoneGap{};
	int _minTimeZoneGapMinutes{};
	
	//Layover最小休息时长（分钟数）,格式：HH:mm，支持*通配表示忽略该参数。与Min WOCL Number任意一个满足条件即可。在配置生效条件下，Pairing中若有多个Layover任一一个满足该条件即合规。
	std::string _strLayoverMinRest{};
	int _layoverMinRestMinutes{};
	

	//Sleep Cycle开始 hh:mm->minutes
	int _sleepCycleStart{};
	//Sleep Cycle结束 hh:mm->minutes
	int _sleepCycleEnd{};
	//最小Sleep Cycle数量

	std::string _strMinSleepCycles{};
	int _minSleepCycles{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//是否忽略"Layover最小休息时长（分钟数）"参数，返回true-忽略，false-未忽略
	bool ignoreMinRestAtLayover() const;

	//是否忽略"Layover最小WOCL次数"参数，返回true-忽略，false-未忽略
	bool ignoreMinWOCLAtLayover() const;

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	//判断Segment是否满足任务类型（计算BLH的任务类型）
	bool MatchSegmentAssignments(const Segment& segment) const;

	//匹配Pairing中FLY Duty数量
	bool MatchPairingDutyNum(const Pairing& pairing) const;

	//判断最小时区差,Pairing中任何落地机场与Home Base时区差
	bool MatchMinTimeZoneGap(const Pairing& pairing, const int baseOffsetTZMinutes) const;

	//检查Pairing的“Layover最小休息时长（分钟数）”和 “Layover最小WOCL次数”是否违规。若多个Layover，任一一个满足该条件即合规
	//若返回true表示合规，false表示不合规
	bool CheckMinRestAndMinWOCLLayover(const Pairing& pairing) const;

	//检查“Layover最小休息时长（分钟数）”是否违规。若多个Layover，任一一个满足该条件即合规。
	//若返回true表示合规，false表示不合规
	bool CheckMinRestAtLayover(const Pairing& pairing) const;

	//检查“Layover最小WOCL次数”是否违规。若多个Layover，任一一个满足该条件即合规。
	//若返回true表示合规，false表示不合规
	bool CheckMinWOCLAtLayover(const Pairing& pairing) const;

	//检查“Layover最小休息时长（分钟数）”是否违规。若返回true表示合规，false表示不合规
	bool CheckMinRestAtLayover(const Duty* currDuty, const Duty* nextDuty) const;

	//检查“Layover最小WOCL次数”是否违规。若返回true表示合规，false表示不合规
	bool CheckMinWOCLAtLayover(const Duty* currDuty, const Duty* nextDuty) const;


	int GetSleepCycleNum(const time_t startTimeLoc, const time_t endTimeLoc) const;
public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
		MIN_REST_AT_LAYOVER_WARN = 1, //违反"Layover最小休息时长（分钟数）"告警
		MIN_WOCL_AT_LAYOVER_WARN = 2 //违反"Layover最小WOCL次数"告警
	};

	bool MatchParam(const Pairing& pairing, const int offsetTZMinutes) const;

	int CheckParam(const Pairing& pairing) const;
};

#endif //_LAYOVERRESTLIMITBYTIMEZONEFOREVAFDRULEPARAM_H_
