/**
 * @file CheckAssignmentOverlappableRuleFirstCaseParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKASSIGNMENTOVERLAPPABLERULEFIRSTPARAM_H_
#define _CHECKASSIGNMENTOVERLAPPABLERULEFIRSTPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class CheckAssignmentOverlappableRule;
class CheckAssignmentOverlappableRuleParam;

class CheckAssignmentOverlappableFirstRuleParam : public RuleParam {
	friend class CheckAssignmentOverlappableRule;
	friend class CheckAssignmentOverlappableRuleParam;
private:
	explicit CheckAssignmentOverlappableFirstRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6121;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		ONLY_CHECK_OVERLAPPABLE_TABLE = 0
	};

	// Y - 忽略表2设置，只检查assignment_overlappable表配置；N - 同时检查
	std::string _onlyCheckOverlappableTable{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	
public:


};

#endif //_CHECKASSIGNMENTOVERLAPPABLERULEFIRSTPARAM_H_
