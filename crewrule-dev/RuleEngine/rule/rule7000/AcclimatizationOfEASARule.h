/**
 * @file AcclimatizationOfEASARule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _ACCLIMATIZATIONOfEASARULE_H_
#define _ACCLIMATIZATIONOfEASARULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "AcclimatizationOfEASARuleParam.h"

class WorkPeriod;
class RestPeriod;
class WindowTime;
class Period;

class AcclimatizationOfEASARule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7000;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit AcclimatizationOfEASARule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, AcclimatizationOfEASARule::RuleFuncId, AcclimatizationOfEASARule::AvailableInterface) {
        ParseParam(input);
    }
    ~AcclimatizationOfEASARule() override = default;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;
private:

    std::vector<AcclimatizationOfEASARuleParam> _ruleParams;

	void ParseParam(const InputType& input);


	bool CalculateDuty(Duty*& lastAcclimatisedDuty, Duty* duty, const std::size_t dutyIndex, const vector<Duty*>& duties, const std::string& base, const AcclimatizationOfEASARuleParam& ruleParam);

	void CalculateDuty(const vector<Duty*>& duties, const std::string& base) ;


};





#endif //_ACCLIMATIZATIONOfEASARULE_H_
