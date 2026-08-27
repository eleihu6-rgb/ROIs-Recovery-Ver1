/**
 * @file RuleSytem.h
 * @brief 
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @version 1.0
 * @date 2023-08-17
**/


#ifndef NEWRULEENGINE_RULESYTEM_H
#define NEWRULEENGINE_RULESYTEM_H

#include <vector>
#include <unordered_map>
#include <memory>
#include "BasicRule.h"
#include "RuleSystemDefine.h"
#include "violationcollector/ViolationCollector.h"

class RuleSystem {

public:
    explicit RuleSystem(ViolationSeverity severity = DefaultSeverity, bool firstFail = false)
        : _violationCollector(severity == ViolationSeverity::MUTE ? nullptr : std::make_unique<ViolationCollector>(severity)) 
        , _firstFail(firstFail) {}

    /*
     * The only way to init new rule
     * NOTE:
     * 1. only take rvalue enforce move
     * 2. use template to enforce definition of InputType of each specific rule
     */
    template<class SubRule>
    void InitRule(typename SubRule::InputType&& args) {
        static_assert(std::is_base_of<BasicRule, SubRule>::value, "SubRule must inherit from BasicRule!");
        static_assert(RuleInterface::InterfaceImplementationCheck::CheckAll<SubRule>(), "Check interface implementation failure");
        auto rule = std::make_unique<SubRule>(this, std::forward<typename SubRule::InputType>(args));
        const auto sequence = (unsigned int)_callSequenceOrder.size();
        _ruleFuncIdLocation.insert({rule->GetRuleFuncId(), sequence});
        _callSequenceRuleFuncId.emplace_back(rule->GetRuleFuncId());
        _callSequenceOrder.emplace_back(sequence);
        _rules.emplace_back(std::move(rule));
    }

    // Check all rule interface, using template to find real interface at compile time
    // Available interface is defined in BasicRule.h
    // Note: RuleInterfaceBit::Interface must be matched with interface implementation
    template<RuleInterface::Interface interface, class... Args>
    bool CheckAllRule(Args &&... args) const {
        static_assert(RuleInterface::CallInputPackCheck::Check<interface, Args...>, "Calling interface doesn't match with definition!");
        bool result = true;
        for (const auto& ruleIndex: _callSequenceOrder) {
            const auto& selectedRule = _rules.at(ruleIndex);
            if (selectedRule->GetAvailableInterface() & interface) {
                result = selectedRule->CheckRule(std::forward<Args>(args)...) && result;
                if (!result && _firstFail) 
                    return false;
            }
        }
        return result;
    }

    // Check specific rule interface, using template to find real interface at compile time
    // Available interface is defined in BasicRule.h
    // Note: RuleInterfaceBit::Interface must be matched with interface implementation
    template<RuleInterface::Interface interface, class... Args>
    bool CheckSpecificRule(const std::vector<unsigned int>& specificRuleFuncId, Args &&... args) const {
        static_assert(RuleInterface::CallInputPackCheck::Check<interface, Args...>, "Calling interface doesn't match with definition!");
        bool result = true;
        for (const auto& ruleFuncId: _callSequenceRuleFuncId) {
            if (std::find(specificRuleFuncId.begin(), specificRuleFuncId.end(), ruleFuncId) == specificRuleFuncId.end()) continue;
            const auto& selectedRule = _rules.at(_ruleFuncIdLocation.at(ruleFuncId));
            if (selectedRule->GetAvailableInterface() & interface) {
                result = selectedRule->CheckRule(std::forward<Args>(args)...) && result;
                if (!result && _firstFail)
                    return false;
            }
        }
        return result;
    }
    
    std::vector<const Violation*> GetAllViolations() const {
        return _violationCollector == nullptr ?
            std::vector<const Violation*>{} : _violationCollector->GetAllViolations();
    }    
    ViolationCollector* GetViolationCollector() const { return _violationCollector.get(); }
    Violation* AddViolation(const ViolationType& type, const ViolationSeverity& severity, const unsigned int& ruleFuncId) const {
        if (_violationCollector) {
            return _violationCollector->AddViolation(type, severity, ruleFuncId);
        }
        return nullptr;
    }

private:
    std::vector<std::unique_ptr<BasicRule>> _rules;
    std::unordered_map<unsigned int, unsigned int> _ruleFuncIdLocation;
    std::vector<unsigned int> _callSequenceRuleFuncId;
    std::vector<unsigned int> _callSequenceOrder;

    std::unique_ptr<ViolationCollector> _violationCollector;
    bool _firstFail = false ;
};

#endif //NEWRULEENGINE_RULESYTEM_H
