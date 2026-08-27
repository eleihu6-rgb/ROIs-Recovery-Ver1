/**
 * @file TrainingConsecutiveDaysFor5JRuleParam.h
 * @brief 7389法规参数类 - 课程连续X天之后要安排Y天休假
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-08
**/

#ifndef _TRAININGCONSECUTIVEDAYSFOR5JRULEPARAM_H_
#define _TRAININGCONSECUTIVEDAYSFOR5JRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class LimitTrainingConsecutiveDaysFor5JRule;

class TrainingConsecutiveDaysFor5JRuleParam : public RuleParam {
	friend class LimitTrainingConsecutiveDaysFor5JRule;
private:
    explicit TrainingConsecutiveDaysFor5JRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7389;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 5;

    enum class ParamLocation {
		BASES = 0,
		RANKS,
		FLEETS,
		TEAMS,
		TYPE
    };

	std::vector<std::string> _bases{};
	std::vector<std::string> _ranks{};
	std::vector<std::string> _fleets{};
	std::vector<std::string> _teams{};

	std::string _type;

    void ParseParam(const std::string& paramString);
    void ParseParam(const DBRule& dbRule);
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:
	enum class WarnCode {
		NO_WARN = 0,
		CONSECUTIVE_TRAINING_WITHOUT_REST = 1,
		HOURS_EXCEEDED = 2
	};

	bool MatchParam(const ROSTER& roster) const;
	int CheckParam(const ROSTER& roster) const;
};

#endif //_TRAININGCONSECUTIVEDAYSFOR5JRULEPARAM_H_