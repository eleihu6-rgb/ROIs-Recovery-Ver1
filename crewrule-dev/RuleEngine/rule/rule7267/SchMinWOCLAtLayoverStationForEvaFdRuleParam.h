/**
 * @file SchMinWOCLAtLayoverStationForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _SCHMINWOCLATLAYOVERSTATIONFOREVAFDRULEPARAM_H_
#define _SCHMINWOCLATLAYOVERSTATIONFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckSchMinWOCLAtLayoverStationForEvaFdRule;

class SchMinWOCLAtLayoverStationForEvaFdRuleParam : public RuleParam {
	friend class CheckSchMinWOCLAtLayoverStationForEvaFdRule;
private:
    explicit SchMinWOCLAtLayoverStationForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7267;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 12;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		LAST_DUTY_COMPOSITIONS = 4,
		DUTY_TYPE = 5,
		SEGMENT_ASSIGNMENTS = 6,
		SECTOR_BLH_RANGES = 7,
		PAIRING_END_STATIONS = 8,
		LAYOVER_MIN_REST = 9,
		SLEEP_CYCLE_START = 10,
		SLEEP_CYCLE_END = 11,
		MIN_SLEEP_CYCLES = 12,
		SEVERITY = 13
    };

	//人员所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//机组人员配比方案,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _lastDutyCompositions{};
	
	//Segment 任务类型,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	vector<string> _segmentAssignments{};

	//Duty中航段飞行时间范围（分钟数）,支持*通配，格式：最小值(HH:mm)-最大值(HH:mm)
	std::string _segmentBlhRanges{};
	int _segmentBlhRangesMinutesLower{};
	int _segmentBlhRangesMinutesUpper{};
	
	//Pairing结束机场,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	vector<std::string> _pairingEndAirports{};

	//Layover最小休息时长（分钟数）,格式：HH:mm，支持*通配表示忽略该参数
	std::string _strMinRestAtLayover{};
	int _minRestAtLayoverMinutes{};

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

	//匹配下一个Duty的配比
	bool MatchNextDutyComposition(const Duty* nextDuty) const;

	//判断Segment是否满足任务类型（计算BLH的任务类型）
	bool MatchSegmentAssignments(const Segment& segment) const;

	//判断Duty中最大Segment飞时是否满足（Segment的assignment要求满足SegmentAssignments）
	bool MatchMaxSegmentFlightTime(const Duty* currDuty) const;

	//判断Pairing结束机场是否满足
	bool MatchPairingEndAirports(const Pairing& pairing) const;

	//检查“Layover最小休息时长（分钟数）”是否违规
	bool CheckMinRestAtLayover(const Duty* currDuty, const Duty* nextDuty) const;

	//检查“Layover最小WOCL次数”是否违规
	bool CheckMinWOCLAtLayover(const Duty* currDuty, const Duty* nextDuty) const;
public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
		MIN_REST_AT_LAYOVER_WARN = 1, //违反"Layover最小休息时长（分钟数）"告警
		MIN_WOCL_AT_LAYOVER_WARN = 2 //违反"Layover最小WOCL次数"告警
	};

	bool MatchParam(const Duty* currDuty, const Duty* nextDuty, const Pairing* pairing) const;

	int CheckParam(const Duty* currDuty, const Duty* nextDuty) const;




};

#endif //_SCHMINWOCLATLAYOVERSTATIONFOREVAFDRULEPARAM_H_
