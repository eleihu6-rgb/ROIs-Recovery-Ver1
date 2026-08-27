/**
 * @file CalculateDutyAloftInMandayForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CALCULATEDUTYALOFTINMANDAYFORPRRULEPARAM_H_
#define _CALCULATEDUTYALOFTINMANDAYFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include <string>
#include <limits>

class CalculateDutyAloftInMandayForPRRule;


class CalculateDutyAloftInMandayForPRRuleParam : public RuleParam {
friend class CalculateDutyAloftInMandayForPRRule;
private:
    explicit CalculateDutyAloftInMandayForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7310;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 13;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		DUTY_COMPOSITIONS = 5,
		DUTY_ASSIGNMENTS = 6,
		FLIGHT_COMPOSITIONS = 7,
		SEGMENT_ASSIGNMENTS = 8,
		SEGMENT_FLEETS = 9,
		SEGMENT_SUB_FLEETS = 10,
		IN_FLIGHT_WAIT_TIME = 11,
		POST_ACTIVITY_TIME = 12,
		SEVERITY = 13
    };

	//所属基地。使用“|”分隔，表示多个值
	vector<std::string> _bases{};

	//人员级别。使用“|”分隔，表示多个值
	vector<std::string> _ranks{};

	//人员机型。使用“|”分隔，表示多个值
	vector<std::string> _fleets{};

	//团队。多个值使用“|”分隔并支持*通配
	vector<std::string> _teams{};

	//Duty配比列表。多个值使用“|”分隔并支持*通配
	vector<std::string> _dutyCompositions{};

	//航班配比列表。多个值使用“|”分隔并支持*通配（预留暂时不用）
	vector<std::string> _flightCompositions{};

	//Duty任务类型列表。多个值使用“|”分隔并支持*通配
	vector<std::string> _dutyAssignments{};

	//航班任务类型列表。多个值使用“|”分隔并支持*通配
	vector<std::string> _segmentAssignments{};

	//航班机型列表。多个值使用“|”分隔并支持*通配
	vector<std::string> _segmentFleets{};

	//航班子机型列表。多个值使用“|”分隔并支持*通配
	vector<std::string> _segmentSubFleets{};

	//航前和航后准备时间(分钟)。格式：HH:mm
	std::string _inFlightWaitTime{};
	int _inFlightWaitTimeMinutes{};

	//飞行后时间(分钟)。格式：HH:mm
	std::string _postActivityTime{};
	int _postActivityTimeMinutes{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;
	
	bool MatchFlightCompositions(const Segment* segment) const;

	bool MatchSegmentAssignment(const std::string& assignment) const;

	bool MatchSegmentFleetAndSubFleet(const Segment* segment) const;

	bool MatchDutyCompositions(const Duty* duty) const;

	bool MatchDutyAssignment(const std::string& assignment) const;
public:

	//匹配参数
	bool MatchParam(const Duty* duty) const;

	bool MatchParam(const Segment* segment) const;

};

#endif //_CALCULATEDUTYALOFTINMANDAYFORPRRULEPARAM_H_
