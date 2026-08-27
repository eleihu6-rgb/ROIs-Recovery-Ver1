#pragma once
#pragma once
#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckConsecutiveDutyRuleParam;

class CheckConsecutiveDutyRuleParam : public RuleParam {
	friend class CheckConsecutiveDutyRule;
private:
	explicit CheckConsecutiveDutyRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7008;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 14;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		ASSIGNMENTS = 4,
		ASSIGNMENT_GROUPS = 5,
		MAX_CONSECUTIVE_TIMES = 6,
		MIN_REST_DAYS = 7,
	};

	std::vector<std::string> _bases{};
	std::vector<std::string> _ranks{};
	std::vector<std::string> _fleets{};
	std::vector<std::string> _teams{};
	//任务类型,使用“|”分隔，表示多个值
	std::vector<std::string> _assignments{};
	//标签
	std::vector<std::string> _attributes{};
	//任务组类型,使用“|”分隔，表示多个值
	std::vector<std::string> _assignmentGroups{};
	//最大连续天数
	int _maxConsecutiveDays{};
	//最大连续工作小时
	int _maxConsecutiveTime{};
	//连续工作天数后，最小休息天数
	int _minRestDays{};

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchAssignment(const std::string& assignment) const;

	bool MatchAssignmentGroup(const std::string& group) const;

};
