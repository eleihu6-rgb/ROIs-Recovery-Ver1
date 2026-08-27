/**
 * @file LimitFleetForStandbyRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITFLEETFORSTANDBYRULEPARAM_H_
#define _LIMITFLEETFORSTANDBYRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class LimitFleetForStandbyRule;

class LimitFleetForStandbyRuleParam : public RuleParam {
friend class LimitFleetForStandbyRule;
private:
    explicit LimitFleetForStandbyRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6026;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 4;

    enum class ParamLocation {
		SEGMENT_ASSIGNMENT_GROUPS = 0,
		SEGMENT_ASSIGNMENTS = 1,
		SEGMENT_FLEET = 2,
		REQUIRED_FLEETS = 3,
		SEVERITY = 4
    };

	//Segment的任务组。多个值使用“|”分隔并支持*通配
	std::vector<std::string> _segmentAssignmentGroups{};
	//Segment任务类型，支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::vector<std::string> _segmentAssignments{};
	//pairing duty segment表的机型
	std::string _segmentFleet{};
	//需要的机型资质,多个值使用“+”分隔表示AND关系,多个值使用“|”分隔表示AND关系
	string _strRequiredFleets;
	string _requiredFleetsOperator = "AND"; //取值：AND 或 OR
	std::vector<std::string> _requiredFleets{};

	void ParseParam(const std::string& paramString);
    //bool MatchParam(const std::string& composition, const long& reportTime, bool isAugment) const;

	void ParseParam(const DBRule& dbRule);

	bool MatchSegmentAssignmentGroups(const Segment& segment) const;

	bool MatchSegmentAssignments(const Segment& segment) const;

	bool MatchSegmentFleet(const Segment& segment) const;

public:

	bool MatchParam(const Segment& segment) const;

	//检查requiredFleets机型该机组人员都需要满足
	bool CheckCrewFleets(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;
};

#endif //_LIMITFLEETFORSTANDBYRULEPARAM_H_
