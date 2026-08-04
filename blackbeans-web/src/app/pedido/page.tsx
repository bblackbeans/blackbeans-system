"use client";

import { Button, Card, Form, Input, Typography, message } from "antd";

export default function PedidoPublicoPage() {
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {contextHolder}
      <Card title="Enviar pedido" style={{ width: "100%", maxWidth: 520 }}>
        <Typography.Paragraph type="secondary">
          Preencha o formulario abaixo. Nossa equipe recebera seu pedido e entrara em contato.
        </Typography.Paragraph>
        <Form
          layout="vertical"
          form={form}
          onFinish={async (values) => {
            const response = await fetch("/api/v1/client-requests/public", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: String(values.title ?? "").trim(),
                description: String(values.description ?? "").trim(),
                contact_name: String(values.contact_name ?? "").trim(),
                contact_email: String(values.contact_email ?? "").trim(),
                contact_phone: String(values.contact_phone ?? "").trim(),
                client_name: String(values.client_name ?? "").trim(),
              }),
            });
            const payload = (await response.json().catch(() => ({}))) as {
              error?: { message?: string };
            };
            if (!response.ok) {
              messageApi.error(payload.error?.message ?? "Falha ao enviar pedido.");
              return;
            }
            messageApi.success("Pedido enviado com sucesso.");
            form.resetFields();
          }}
        >
          <Form.Item name="title" label="Titulo" rules={[{ required: true, message: "Informe o titulo." }]}>
            <Input placeholder="Resumo do pedido" />
          </Form.Item>
          <Form.Item name="description" label="Descricao">
            <Input.TextArea rows={4} placeholder="Detalhes do que voce precisa" />
          </Form.Item>
          <Form.Item
            name="client_name"
            label="Empresa / Cliente"
            rules={[{ required: true, message: "Informe a empresa ou cliente." }]}
          >
            <Input placeholder="Nome da empresa" />
          </Form.Item>
          <Form.Item
            name="contact_name"
            label="Seu nome"
            rules={[{ required: true, message: "Informe seu nome." }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="contact_email"
            label="E-mail de contato"
            rules={[
              { required: true, message: "Informe o e-mail." },
              { type: "email", message: "E-mail invalido." },
            ]}
          >
            <Input type="email" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Enviar pedido
          </Button>
        </Form>
      </Card>
    </div>
  );
}
