/**
 * @file GroundRosterMinRestFor5JRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-05-18
**/

#ifndef _GROUNDROSTERMINRESTFOR5JRULEPARAM_H_
#define _GROUNDROSTERMINRESTFOR5JRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <vector>

class CalculateGroundRosterMinRestFor5JRule;

class GroundRosterMinRestFor5JRuleParam : public RuleParam {
	friend class CalculateGroundRosterMinRestFor5JRule;
private:
	explicit GroundRosterMinRestFor5JRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7373;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 3;

	enum class ParamLocation {
		ASSIGNMENT_GROUPS = 0,
		ASSIGNMENTS = 1,
		MIN_REST = 2
	};

	std::vector<std::string> _assignmentGroups{};
	std::vector<std::string> _assignments{};
	std::string _minRest{};
	int _minRestMinutes{ -1 };

	void ParseParam(const std::string& paramString);
	void ParseParam(const DBRule& dbRule);

	
	bool MatchWorkAssignment(const ROSTER& roster) const;

	bool MatchGroundAssignments(const ROSTER& roster) const;
	bool MatchGroundAssignmentGroups(const ROSTER& roster) const;

public:
	bool MatchParam(const ROSTER& roster) const;
};

#endif //_GROUNDROSTERMINRESTFOR5JRULEPARAM_H_