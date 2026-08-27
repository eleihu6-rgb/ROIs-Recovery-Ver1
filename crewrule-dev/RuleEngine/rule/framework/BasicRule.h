/**
 * @file BasicRule.h
 * @brief 
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @version 1.0
 * @date 2023-08-16
**/


#ifndef NEWRULEENGINE_BASICRULE_H
#define NEWRULEENGINE_BASICRULE_H

#include <vector>
#include "spdlog/spdlog.h"
#include "Rule.h"
#include "RuleSystemDefine.h"

class RuleSystem;

class BasicRule : public Rule {

public:
    // store ruleId and availableInterface in the instance instead of class to enable polymorphism
    // NOTE: recommended to define constexpr static for these two variable in class, see DemoRule
    explicit BasicRule(const RuleSystem* system, unsigned int ruleFuncId, RuleInterface::InterfaceUnderlyingType availableInterface):
		Rule(system, ruleFuncId, availableInterface) {}
    virtual ~BasicRule() = default;

    // Rule Interface, must be one-on-one match with RuleInterfaceBit::Interface enum
    virtual bool CheckRule(RuleInterface::InputType::SingleSegmentInputType segment) const { return CheckNotImplemented(RuleInterface::Interface::SingleSegment); };
    virtual bool CheckRule(RuleInterface::InputType::SingleDutyInputType duty) const { return CheckNotImplemented(RuleInterface::Interface::SingleDuty); };
    virtual bool CheckRule(RuleInterface::InputType::SinglePairingInputType pairing) const { return CheckNotImplemented(RuleInterface::Interface::SinglePairing); };
    virtual bool CheckRule(RuleInterface::InputType::SingleCrewRosterInputType rosters) const { return CheckNotImplemented(RuleInterface::Interface::GroupedRoster); };
    virtual bool CheckRule(RuleInterface::InputType::SingleCrewInputType crew) const { return CheckNotImplemented(RuleInterface::Interface::SingleCrew); };

    //// Getter for common info
    //unsigned int GetRuleFuncId() const { return _ruleFuncId; }
    //unsigned long long GetAvailableInterface() const { return _availableInterface; }

//protected:
//    const unsigned int _ruleFuncId;
//
//    // The available interface use bit mask to control on and off
//    const RuleInterface::InterfaceUnderlyingType _availableInterface; // 64-bit supports maximum 64 interfaces
//    const RuleSystem* _ruleSystem;

private:
    bool CheckNotImplemented(RuleInterface::Interface interfaceType) const {
        auto typeInt = enum_to_underlying(interfaceType);
        unsigned char significantBit = 0;
        while (typeInt >>= 1) {
            ++significantBit;
        }
        spdlog::critical("CheckAllRule not implemented but called in RuleFuncId: {0:>5}, Interface bit: {1:>2}", _ruleFuncId, significantBit);
        return false;
    }
};


#endif //NEWRULEENGINE_BASICRULE_H
