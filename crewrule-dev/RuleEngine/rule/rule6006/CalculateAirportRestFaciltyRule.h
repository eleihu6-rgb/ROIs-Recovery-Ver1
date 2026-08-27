/**
 * @file CalculateAirportRestFaciltyRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEAIRPORTRESTFACILTYRULE_H_
#define _CALCULATEAIRPORTRESTFACILTYRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateAirportRestFaciltyRuleParam.h"

class CalculateAirportRestFaciltyRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6006;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit CalculateAirportRestFaciltyRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateAirportRestFaciltyRule::RuleFuncId, CalculateAirportRestFaciltyRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculateAirportRestFaciltyRule() override = default;

	void CalculateDuty(Duty *duty) override;

	void CalculateDuty(Pairing* pairing) override;
private:

    std::vector<CalculateAirportRestFaciltyRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(const vector<Duty*>& duties);

	bool CalculateDuty(Segment* currSegment, const Segment* nextSegment, const std::string& base, const CalculateAirportRestFaciltyRuleParam& ruleParam);

    //休息设施优先级判断，若destRestFacilty高于srcRestFacilty，则返回true；否则返回false
    bool checkRestFaciltyPriority(const string& srcRestFacilty, const string& destRestFacilty);

};





#endif //_CALCULATEAIRPORTRESTFACILTYRULE_H_
