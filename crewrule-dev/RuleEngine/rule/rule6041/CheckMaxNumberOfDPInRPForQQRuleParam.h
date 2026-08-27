/**
 * @file CheckMaxNumberOfDPInRPForQQRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKMAXNUMBEROFDPINRPFORQQRULEPARAM_H_
#define _CHECKMAXNUMBEROFDPINRPFORQQRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMaxNumberOfDPInRPForQQRule;

class CheckMaxNumberOfDPInRPForQQRuleParam : public RuleParam {
	friend class CheckMaxNumberOfDPInRPForQQRule;
private:
	explicit CheckMaxNumberOfDPInRPForQQRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6041;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 4;

	enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		DUTY_ASSIGNMENT_GROUPS = 5,
		DUTY_ASSIGNMENTS = 6,
		DP_RANGES = 7,
		MAX_LIMITATION = 8
	};

	//所属基地,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _bases{};
	//人员级别,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _ranks{};
	//人员机型,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};
	//Duty的任务组类型,多个值使用“|”分隔并支持*通配。
	vector<std::string> _dutyAssignmentGroups{};
	//Duty的任务类型,多个值使用“|”分隔并支持*通配。
	vector<std::string> _dutyAssignments{};
	//DP时间范围（分钟数）,格式：HH:mm-HH:mm
	std::string _dpRanges{};
	int _dpMinutesLower{};
	int _dpMinutesUpper{};

	//duty 最多次数
	int _maxLimitation{};

	void ParseParam(const DBRule& dbRule);


public:

	int GetMatchDutyNumber(const vector<Duty*> duties, const time_t checkStart, const time_t checkEnd) const;
	
	bool MatchAssignment(const std::string& assignment) const;

	bool MatchAssignmentGroup(const std::string& group) const;

	bool MatchDutyPeriod(const Duty* duty) const;

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

};

#endif //_CHECKMAXNUMBEROFDPINRPFORQQRULEPARAM_H_
