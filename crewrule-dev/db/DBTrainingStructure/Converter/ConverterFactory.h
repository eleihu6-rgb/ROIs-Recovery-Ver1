//
// Created by haoli on 2025/8/18.
//

#ifndef TRAININGOPTIMIZER_CONVERTERFACTORY_H
#define TRAININGOPTIMIZER_CONVERTERFACTORY_H

#include "ConcreteConverter.h"

class ConverterFactory {
public:
    static ConverterFactory &Instance() {
        static ConverterFactory factory;
        return factory;
    }

    ConverterFactory(const ConverterFactory &) = delete;

    ConverterFactory &operator=(const ConverterFactory &) = delete;

    template<typename SourceType, typename TargetType>
    void RegisterConverter() {
        auto converter = std::make_shared<ConcreteConverter<SourceType, TargetType>>();
        auto typeName = std::string(typeid(SourceType).name()) + "->" + std::string(typeid(TargetType).name());
        _converters[typeName] = converter;
        _typeNames.emplace_back(typeName);
    }

    [[nodiscard]] std::shared_ptr<IConverter>
    GetConverter(const std::type_info &sourceType, const std::type_info &targetType) const {
        auto typeName = std::string(sourceType.name()) + "->" + std::string(targetType.name());
        auto it = _converters.find(typeName);
        if (it != _converters.end()) {
            return it->second;
        }
        return nullptr;
    }

    [[nodiscard]] const std::vector<std::string> &RegisteredTypes() const {
        return _typeNames;
    }

    [[nodiscard]] std::optional<TargetVariant>
    Convert(const std::any &data, const std::type_info &sourceType, const std::type_info &targetType) const {
        if (auto converter = GetConverter(sourceType, targetType)) {
            return converter->Convert(data);
        }
        return std::nullopt;
    }

    template<typename TargetType, typename SourceType>
    std::vector<TargetVariant> BatchConvert(const std::vector<SourceType> &sourceVec) const {
        std::vector<TargetVariant> results;
        results.reserve(sourceVec.size());

        for (const auto &item: sourceVec) {
            if (auto converted = Convert(item, typeid(SourceType), typeid(TargetType))) {
                results.push_back(*converted);
            }
        }

        return results;
    }

private:
    ConverterFactory();

    std::unordered_map<std::string, std::shared_ptr<IConverter>> _converters;
    std::vector<std::string> _typeNames;
};

#endif //TRAININGOPTIMIZER_CONVERTERFACTORY_H
