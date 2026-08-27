/**
 * @file CalculateRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-06
**/


#ifndef NEWRULEENGINE_CALCULATERULE_H
#define NEWRULEENGINE_CALCULATERULE_H

#include "CrewDB.h"
#include "Rule.h"

class RuleSystem;

template<typename T>
class CalculateRule : public Rule {

public:

	explicit CalculateRule(const RuleSystem* system, unsigned int ruleFuncId, RuleInterface::InterfaceUnderlyingType availableInterface) :
		Rule(system, ruleFuncId, availableInterface) {}
	virtual ~CalculateRule() = default;

	virtual void CalculateDuty(Duty* duty) {};

	virtual void CalculateDuty(Pairing* pairing) {};

	virtual void CalculateDuty(std::vector<const ROSTER*>& rosters) {};

	virtual T Calculate(Duty* duty) { return T{}; };

	virtual T Calculate(Pairing* pairing) { return T{}; };

	virtual T Calculate(std::vector<const ROSTER*>& rosters) { return T{}; };

	virtual T Calculate(Segment* segment) { return T{}; };

};

#endif //NEWRULEENGINE_CALCULATERULE_H